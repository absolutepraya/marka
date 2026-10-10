"use client";

import { useEffect } from "react";

// Hydrates inside the startup Suspense boundary, after its destination arrives.
export default function StartupReady() {
  useEffect(() => {
    document.documentElement.dataset.startupReady = "true";
    document.getElementById("marka-startup-content")?.removeAttribute("inert");
    window.dispatchEvent(new Event("marka:startup-ready"));
  }, []);
  return null;
}
