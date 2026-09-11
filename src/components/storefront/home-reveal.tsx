"use client";

import { useEffect } from "react";

export function HomeReveal() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("[data-home-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sections.forEach((section) => section.dataset.visible = "true");
      return;
    }
    document.documentElement.classList.add("sf-reveal-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.visible = "true";
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return null;
}
