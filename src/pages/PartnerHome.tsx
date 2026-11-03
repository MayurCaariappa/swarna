import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";

export default function PartnerHome() {
  const { counterpart } = useAuth();
  const name = counterpart?.display_name || "Your partner";

  return (
    <div className="stack">
      <h1>{name}</h1>

      <section className="card hero">
        <p className="muted">Linked ✓</p>
        <p className="hero-text">You're connected</p>
        <p className="muted small">
          When {name} starts logging, her cycle, next bleed and anything else
          she shares will appear here.
        </p>
      </section>

      <Disclaimer />
    </div>
  );
}
