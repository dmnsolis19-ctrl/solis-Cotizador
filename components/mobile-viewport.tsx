"use client";
import { useEffect } from "react";
// VisualViewport follows the space above a mobile keyboard; dvh alone does not on every browser.
export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport; if (!viewport) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--visual-viewport-height", `${viewport.height}px`);
      document.documentElement.style.setProperty("--visual-viewport-top", `${viewport.offsetTop}px`);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest('[role="dialog"]') && viewport.height < window.innerHeight * .8) focused.scrollIntoView({ block: "nearest" });
    }); };
    update(); viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update);
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); document.documentElement.style.removeProperty("--visual-viewport-height"); document.documentElement.style.removeProperty("--visual-viewport-top"); };
  }, []);
  return null;
}
