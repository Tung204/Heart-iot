import { Link } from 'react-router-dom';

/** Header công khai: chỉ logo. CTA duy nhất nằm ở hero để không lặp điểm vào. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="brand">
          Theo dõi sức khỏe
        </Link>
      </div>
    </header>
  );
}
