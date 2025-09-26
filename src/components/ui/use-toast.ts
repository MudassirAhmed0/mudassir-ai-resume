// src/components/ui/use-toast.ts
"use client";

type ToastOpts = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | string;
};

export function useToast() {
  function toast(opts: ToastOpts) {
    const title = opts.title || "";
    const description = opts.description || "";
    try {
      // Non-blocking console notice for debugging
      // eslint-disable-next-line no-console
      console.info("toast:", { title, description, variant: opts.variant });

      if (typeof window === "undefined") return;

      const rootId = "toast-root";
      let root = document.getElementById(rootId);
      if (!root) {
        root = document.createElement("div");
        root.id = rootId;
        Object.assign(root.style, {
          position: "fixed",
          right: "16px",
          bottom: "16px",
          zIndex: "2147483647",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none",
        } as CSSStyleDeclaration);
        document.body.appendChild(root);
      }

      const card = document.createElement("div");
      Object.assign(card.style, {
        pointerEvents: "auto",
        background: "#111827",
        color: "#F9FAFB",
        borderRadius: "10px",
        padding: "10px 12px",
        boxShadow:
          "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
        maxWidth: "340px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, Apple Color Emoji, Segoe UI Emoji",
        transform: "translateY(8px)",
        opacity: "0",
        transition: "opacity 150ms ease, transform 150ms ease",
      } as CSSStyleDeclaration);

      if (opts.variant === "destructive") {
        card.style.background = "#7F1D1D"; // red-900
      }

      if (title) {
        const h = document.createElement("div");
        h.textContent = title;
        Object.assign(h.style, {
          fontWeight: "600",
          marginBottom: description ? "2px" : "0",
        } as CSSStyleDeclaration);
        card.appendChild(h);
      }
      if (description) {
        const p = document.createElement("div");
        p.textContent = description;
        Object.assign(p.style, {
          fontSize: "12px",
          lineHeight: "1.2",
          opacity: "0.9",
        } as CSSStyleDeclaration);
        card.appendChild(p);
      }

      root.appendChild(card);
      requestAnimationFrame(() => {
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
      });

      const lifetime = 3200;
      const remove = () => {
        card.style.opacity = "0";
        card.style.transform = "translateY(8px)";
        window.setTimeout(() => {
          try {
            root?.removeChild(card);
          } catch {}
        }, 180);
      };

      const t = window.setTimeout(remove, lifetime);
      card.addEventListener("click", () => {
        window.clearTimeout(t);
        remove();
      });
    } catch {}
  }
  return { toast };
}
