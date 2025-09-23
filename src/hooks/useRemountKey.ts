import { useState } from "react";

export function useRemountKey() {
  const [key, setKey] = useState(() => Date.now());
  const bump = () => setKey(Date.now());
  return { key, bump };
}
