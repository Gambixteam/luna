import { LunaApp } from '@/components/luna-app';

export default function DashboardPage() {
  return <><LunaApp /><a className="admin-fab" href="/admin">Gambix admin</a><a className="google-connect-fab" href="/connect-google">Connect Google</a></>;
}
