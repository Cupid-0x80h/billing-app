import { useState } from "react";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import type { SessionUser } from "./types";

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  if (user.mustChangePassword) {
    return (
      <ChangePassword
        user={user}
        onChanged={() => setUser({ ...user, mustChangePassword: false })}
        onLogout={() => setUser(null)}
      />
    );
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}
