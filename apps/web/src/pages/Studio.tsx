import { useNavigate } from "react-router-dom";
import { LeaderSheet } from "../components/LeaderSheet";

export function Studio() {
  const navigate = useNavigate();
  return (
    <main className="page">
      <LeaderSheet onClose={() => navigate("/")} />
    </main>
  );
}
