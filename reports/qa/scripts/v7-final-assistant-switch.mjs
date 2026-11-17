// v7 final QA — điều kiện 1: đổi hồ sơ A→B xoá thread + số liệu/insight của A.
// Chạy tay: node reports/qa/scripts/v7-final-assistant-switch.mjs
// Cần: web 127.0.0.1:4361, API 127.0.0.1:3013 (PGlite .data/final, seed demo).
// Tài khoản: người thân seed (Minh) — có 2 hồ sơ: Bà An (được chia sẻ) và Ông Bình (sở hữu).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(
  'C:/Users/nguye/orca/workspaces/DATN/v7-final-qa/apps/web/package.json',
);
const { chromium } = requireFromWeb('@playwright/test');

const WEB = 'http://127.0.0.1:4361';
const API = 'http://127.0.0.1:3013/api/v1';
const OUT = 'reports/qa/evidence/v7-final';
const CAREGIVER = { email: 'minh@demo.heart-iot.local', password: 'demo-heart-iot-2026' };
const SUBJECT_AN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUBJECT_BINH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QUESTION = 'Nhịp tim tuần này thế nào?';

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });
const report = { at: new Date().toISOString(), web: WEB, api: API, account: CAREGIVER.email, runs: [] };

const browser = await chromium.launch();

async function login(context) {
  const response = await context.request.post(`${API}/auth/login`, {
    data: CAREGIVER,
    headers: { Origin: WEB },
  });
  if (!response.ok()) throw new Error(`Login lỗi ${response.status()}: ${await response.text()}`);
}

function snapshotText() {
  return document.body.innerText;
}

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });
    await context.addInitScript((subjectId) => {
      window.localStorage.setItem('an:active-subject-id', subjectId);
    }, SUBJECT_AN);
    await login(context);

    const page = await context.newPage();
    const network = [];
    page.on('response', (response) => {
      const url = response.url();
      if (!url.startsWith(API)) return;
      network.push({
        method: response.request().method(),
        path: url.slice(API.length),
        status: response.status(),
        resourceType: response.request().resourceType(),
      });
    });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    const run = { viewport: vp, steps: {}, network, consoleErrors };
    try {
      // 1. Hồ sơ A: mở /app/assistant, chờ context + form hỏi.
      await page.goto(`${WEB}/app/assistant`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1, name: 'Hôm nay' }).waitFor({ timeout: 20_000 });
      const select = page.locator('#active-subject-select');
      await select.waitFor({ timeout: 10_000 });
      const contextBefore = {
        selectedValue: await select.inputValue(),
        selectedText: (await select.locator('option:checked').innerText()).trim(),
        label: (await page.locator('.subject-context__label').first().innerText()).trim(),
        options: await select.locator('option').evaluateAll((nodes) =>
          nodes.map((node) => ({ value: node.value, text: node.textContent.trim() })),
        ),
      };
      const labelBefore = (await page.locator('label[for="assistant-question"]').innerText()).trim();
      run.steps.contextBefore = { ...contextBefore, questionLabel: labelBefore };

      // 2. Gửi 1 câu hỏi cho A và chờ câu trả lời thật.
      await page.locator('#assistant-question').fill(QUESTION);
      const startedAsk = Date.now();
      await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
      const log = page.getByRole('log', { name: 'Hội thoại' });
      await log.waitFor({ timeout: 30_000 });
      await log.locator('.today-answer__text').first().waitFor({ timeout: 30_000 });
      const answerBefore = (await log.locator('.today-answer__text').first().innerText()).trim();
      run.steps.asked = {
        question: QUESTION,
        answer: answerBefore,
        answerMs: Date.now() - startedAsk,
        threadText: (await log.innerText()).trim(),
      };
      const textBefore = await page.evaluate(snapshotText);
      run.steps.beforeText = textBefore.slice(0, 4_000);
      const numbersBefore = {
        bpm: [...textBefore.matchAll(/(\d+(?:[.,]\d+)?)\s*bpm/gi)].map((m) => m[0]),
        steps: [...textBefore.matchAll(/(\d[\d.\s]*)\s*bước/gi)].map((m) => m[0]),
        percent: [...textBefore.matchAll(/\d+(?:[.,]\d+)?\s*%/g)].map((m) => m[0]),
      };
      run.steps.numbersBefore = numbersBefore;
      await page.screenshot({
        path: join(OUT, `assistant-${vp.name}-before-switch.png`),
        fullPage: false,
      });

      // 3. Đổi sang hồ sơ B (Ông Bình) qua select trong dòng ngữ cảnh.
      const beforeSwitchIndex = network.length;
      await select.selectOption(SUBJECT_BINH);
      // Chờ select chuyển sang B và request B đã trả về (status/alerts), rồi mới đo.
      await page.waitForFunction(
        (subjectId) => document.querySelector('#active-subject-select')?.value === subjectId,
        SUBJECT_BINH,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(2_500);
      const afterNetwork = network.slice(beforeSwitchIndex);
      const textAfter = await page.evaluate(snapshotText);
      const contextAfter = {
        selectedValue: await select.inputValue(),
        selectedText: (await select.locator('option:checked').innerText()).trim(),
        label: (await page.locator('.subject-context__label').first().innerText()).trim(),
      };
      const labelAfter = (await page.locator('label[for="assistant-question"]').innerText()).trim();
      const logCountAfter = await page.getByRole('log', { name: 'Hội thoại' }).count();
      const questionInPage = textAfter.includes(QUESTION);
      const answerInPage = answerBefore.length > 0 && textAfter.includes(answerBefore);
      const numbersAfter = {
        bpm: [...textAfter.matchAll(/(\d+(?:[.,]\d+)?)\s*bpm/gi)].map((m) => m[0]),
        steps: [...textAfter.matchAll(/(\d[\d.\s]*)\s*bước/gi)].map((m) => m[0]),
        percent: [...textAfter.matchAll(/\d+(?:[.,]\d+)?\s*%/g)].map((m) => m[0]),
      };
      const leakedAValues = {
        bpm: numbersBefore.bpm.filter((value) => textAfter.includes(value)),
        steps: numbersBefore.steps.filter((value) => textAfter.includes(value)),
        percent: numbersBefore.percent.filter((value) => textAfter.includes(value)),
      };
      const askRequestsAfter = afterNetwork.filter((item) => item.path.includes('/assistant/ask'));
      const subjectRequestsAfter = afterNetwork.filter(
        (item) => item.path.includes(SUBJECT_AN) || item.path.includes('subjects'),
      );
      const bRequests = afterNetwork.filter((item) => item.path.includes(SUBJECT_BINH));
      const subjectsResponse = await context.request.get(`${API}/subjects`);
      const subjectsBody = await subjectsResponse.json();
      const bSubject = (subjectsBody.items ?? []).find((item) => item.id === SUBJECT_BINH) ?? null;
      const askButton = page.getByRole('button', { name: 'Gửi câu hỏi' });
      const formState = {
        askDisabled: await askButton.isDisabled(),
        hint: await page
          .locator('.today-ask__hint')
          .allInnerTexts()
          .then((items) => items.map((item) => item.trim())),
        permissionAlerts: await page
          .locator('.today-ask .alert')
          .allInnerTexts()
          .then((items) => items.map((item) => item.trim())),
      };
      await page.screenshot({
        path: join(OUT, `assistant-${vp.name}-after-switch.png`),
        fullPage: false,
      });

      run.steps.afterSwitch = {
        contextText: contextAfter,
        questionLabel: labelAfter,
        questionPresentInPage: questionInPage,
        answerPresentInPage: answerInPage,
        threadLogCount: logCountAfter,
        numbersAfter,
        leakedAValues,
        askRequestsAfter,
        bRequests,
        subjectRequestsAfter,
        bSubject: bSubject
          ? {
              role: bSubject.role,
              permissions: bSubject.permissions,
              ownerUserId: bSubject.ownerUserId,
            }
          : null,
        formState,
        textAfter: textAfter.slice(0, 4_000),
      };
      run.ok =
        contextAfter.selectedValue === SUBJECT_BINH &&
        contextAfter.selectedText.includes('Ông Nguyễn Văn Bình') &&
        labelAfter.includes('Ông Nguyễn Văn Bình') &&
        !questionInPage &&
        !answerInPage &&
        logCountAfter === 0 &&
        leakedAValues.bpm.length === 0 &&
        leakedAValues.steps.length === 0 &&
        leakedAValues.percent.length === 0 &&
        askRequestsAfter.length === 0 &&
        formState.askDisabled === false &&
        bSubject?.role === 'owner' &&
        bSubject?.permissions?.canViewMeasurements === true &&
        bSubject?.permissions?.canViewAi === true;
      if (!run.ok) run.failure = 'Một hoặc nhiều điều kiện sau đổi hồ sơ không đạt.';
    } catch (error) {
      run.ok = false;
      run.error = String(error?.stack ?? error);
      await page
        .screenshot({ path: join(OUT, `assistant-${vp.name}-switch-error.png`), fullPage: false })
        .catch(() => {});
    }
    report.runs.push(run);
    await context.close();
  }
} finally {
  await browser.close();
}

report.ok = report.runs.length > 0 && report.runs.every((run) => run.ok);
writeFileSync(join(OUT, 'assistant-switch.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: report.ok,
      runs: report.runs.map((run) => ({
        viewport: run.viewport.name,
        ok: run.ok,
        contextBefore: run.steps.contextBefore,
        asked: run.steps.asked?.answer?.slice(0, 160),
        after: run.steps.afterSwitch && {
          context: run.steps.afterSwitch.contextText,
          questionPresentInPage: run.steps.afterSwitch.questionPresentInPage,
          answerPresentInPage: run.steps.afterSwitch.answerPresentInPage,
          threadLogCount: run.steps.afterSwitch.threadLogCount,
          numbersBefore: run.steps.numbersBefore,
          numbersAfter: run.steps.afterSwitch.numbersAfter,
          leakedAValues: run.steps.afterSwitch.leakedAValues,
          askRequestsAfter: run.steps.afterSwitch.askRequestsAfter,
          bSubject: run.steps.afterSwitch.bSubject,
          formState: run.steps.afterSwitch.formState,
        },
        error: run.error,
      })),
    },
    null,
    2,
  ),
);
process.exitCode = report.ok ? 0 : 1;
