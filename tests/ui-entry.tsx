import { createRoot } from "react-dom/client";
import Dashboard from "../components/Dashboard";
import { usePathname } from "./ui-navigation";
function App() {
  const section = usePathname().slice(1) || "overview";
  return (
    <Dashboard
      key={section}
      section={section}
      admin={{ name: "Test Administrator", email: "admin@example.test" }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
