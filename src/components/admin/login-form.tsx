"use client";

import { useActionState, useState } from "react";

import { loginAction } from "@/actions/auth";
import { Icon } from "@/components/admin/icons";

const initialState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="login-form">
      <div className="form-field">
        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          placeholder="vous@benamishop.com"
        />
      </div>

      <div className="form-field">
        <label htmlFor="password">Mot de passe</label>
        <div className="password-input">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={12}
            placeholder="••••••••••••"
          />
          <button
            type="button"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            <Icon name={showPassword ? "eyeOff" : "eye"} width="20" height="20" />
          </button>
        </div>
      </div>

      <div className="login-error" aria-live="polite">
        {state.error ? <p>{state.error}</p> : null}
      </div>

      <button className="login-submit" type="submit" disabled={pending}>
        {pending ? <span className="spinner" aria-hidden="true" /> : null}
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
