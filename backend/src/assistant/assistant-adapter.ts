import { Inject, Injectable } from '@nestjs/common';
import { ENV, type AppEnv } from '../config/env';

/**
 * Adapter AI — interface + token để test override bằng fake adapter.
 * Chỉ có provider OpenAI-compatible chat completions. `AI_API_KEY` chỉ được đọc
 * từ env và không bao giờ xuất hiện trong log, exception hay audit.
 */

export const ASSISTANT_AI_ADAPTER = Symbol('ASSISTANT_AI_ADAPTER');

/** Timeout gọi provider cho trợ lý (theo hợp đồng wave 2: 10 giây). */
export const ASSISTANT_AI_TIMEOUT_MS = 10_000;

export type AssistantChatMessage = { role: 'system' | 'user'; content: string };

export type AssistantCompletion = {
  content: string;
  provider: 'openai-compatible';
  model: string | null;
};

export interface AssistantAiAdapter {
  /** Có cấu hình AI hay không; service dùng để quyết định gọi model hay dùng template. */
  isConfigured(): boolean;
  complete(messages: AssistantChatMessage[]): Promise<AssistantCompletion>;
}

export type AssistantAdapterErrorKind = 'timeout' | 'http_error' | 'invalid_response';

export class AssistantAdapterError extends Error {
  readonly kind: AssistantAdapterErrorKind;

  constructor(kind: AssistantAdapterErrorKind, message: string) {
    super(message);
    this.name = 'AssistantAdapterError';
    this.kind = kind;
  }
}

function extractChatContent(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const choices = record['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== 'object') return null;
  const message = (first as Record<string, unknown>)['message'];
  if (!message || typeof message !== 'object') return null;
  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : null;
}

@Injectable()
export class OpenAiCompatibleAdapter implements AssistantAiAdapter {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  isConfigured(): boolean {
    return !!this.env.AI_BASE_URL;
  }

  async complete(messages: AssistantChatMessage[]): Promise<AssistantCompletion> {
    const baseUrl = this.env.AI_BASE_URL;
    if (!baseUrl) {
      throw new AssistantAdapterError('http_error', 'AI provider chưa được cấu hình.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASSISTANT_AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.env.AI_API_KEY ? { authorization: `Bearer ${this.env.AI_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: this.env.AI_MODEL ?? '',
          messages,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AssistantAdapterError(
          'http_error',
          `AI provider trả HTTP ${response.status}.`,
        );
      }
      const body = (await response.json()) as unknown;
      const content = extractChatContent(body);
      if (!content || content.trim().length === 0) {
        throw new AssistantAdapterError(
          'invalid_response',
          'AI provider trả nội dung rỗng hoặc sai cấu trúc.',
        );
      }
      return { content, provider: 'openai-compatible', model: this.env.AI_MODEL ?? null };
    } catch (error) {
      if (error instanceof AssistantAdapterError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AssistantAdapterError('timeout', 'Hết thời gian chờ AI provider.');
      }
      // Không đưa nội dung lỗi mạng vào message: tránh rò rỉ URL/header/key.
      throw new AssistantAdapterError('http_error', 'Lỗi kết nối tới AI provider.');
    } finally {
      clearTimeout(timer);
    }
  }
}
