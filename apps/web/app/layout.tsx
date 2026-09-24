import './style.css';
export const metadata = { title: 'AccessLobby', description: 'Identity and sign-in' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><main>{children}</main></body></html>;
}
