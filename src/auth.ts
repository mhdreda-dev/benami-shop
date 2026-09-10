import "server-only";

import NextAuth, { AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { prisma } from "@/lib/prisma";

export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  logger: {
    error(error) {
      if (error instanceof AuthError && error.type === "CredentialsSignin") return;
      if (error instanceof AuthError && error.type === "JWTSessionError") {
        console.warn("[auth] Invalid session rejected.");
        return;
      }
      console.error("[auth] Unexpected authentication error.", error);
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Adresse e-mail", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials.password === "string" ? credentials.password : "";

        if (!email || !password || email.length > 254 || password.length > 256) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            role: true,
          },
        });

        if (!user || user.role !== "ADMIN") {
          return null;
        }

        const passwordMatches = await compare(password, user.passwordHash);

        if (!passwordMatches) {
          return null;
        }

        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.role = user.role;
      }

      return token;
    },
    session({ session, token }) {
      if (typeof token.id !== "string" || token.role !== "ADMIN") {
        return session;
      }

      session.user.id = token.id;
      session.user.email = token.email ?? "";
      session.user.role = token.role;

      return session;
    },
  },
});
