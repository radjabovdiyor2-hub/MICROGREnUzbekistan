import * as Icons from '@/components/ui/Icons';

export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-16)', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ marginBottom: 'var(--space-4)', color: 'var(--text-muted)' }}><Icons.Home size={100} /></div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)', marginBottom: 'var(--space-2)' }}>
        404
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-8)' }}>
        Sahifa topilmadi
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <a href="/" className="btn btn-primary btn-lg" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icons.Home size={20} /> Bosh sahifa</a>
        <a href="/catalog" className="btn btn-outline btn-lg" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icons.Folder size={20} /> Katalog</a>
      </div>
    </div>
  );
}
