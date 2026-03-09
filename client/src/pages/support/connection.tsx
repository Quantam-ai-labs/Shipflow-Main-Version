import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SupportConnectionPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/settings?tab=whatsapp", { replace: true });
  }, [navigate]);

  return null;
}
