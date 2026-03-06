import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AccountingSales() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (editId) {
      navigate(`/accounting/sale-orders?edit=${editId}`, { replace: true });
    } else {
      navigate("/accounting/sale-orders", { replace: true });
    }
  }, [navigate]);

  return null;
}
