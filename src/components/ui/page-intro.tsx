import type { ReactNode } from "react";

type PageIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: PageIntroProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-3xl">
        <p className="mb-5 text-xs font-semibold tracking-[0.22em] text-muted uppercase">
          {eyebrow}
        </p>
        <h1 className="max-w-2xl text-4xl leading-[1.08] font-medium tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
          {description}
        </p>
        {children ? <div className="mt-9">{children}</div> : null}
      </div>
    </section>
  );
}
