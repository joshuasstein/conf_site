"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, MailOpen, XCircle, Loader2 } from "lucide-react";

type State = "loading" | "success" | "already_verified" | "error" | "pending";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const token = searchParams.get("token");
  const pending = searchParams.get("pending") === "true";

  const [state, setState] = useState<State>(token ? "loading" : "pending");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;

    auth.verifyEmail(token)
      .then(async () => {
        await refreshUser();
        setState("success");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Verification failed";
        if (msg.toLowerCase().includes("already")) {
          setState("already_verified");
        } else {
          setErrorMsg(msg);
          setState("error");
        }
      });
  }, [token, refreshUser]);

  const handleResend = async () => {
    setResending(true);
    try {
      await auth.resendVerification();
      setResent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend";
      setErrorMsg(msg);
    } finally {
      setResending(false);
    }
  };

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm text-slate-500">Verifying your email…</p>
        </CardContent>
      </Card>
    );
  }

  if (state === "success") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mb-1" />
          <CardTitle>Email verified</CardTitle>
          <CardDescription>Your email address has been confirmed.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href={user ? "/" : "/login"}>
              {user ? "Go to my abstracts" : "Sign in"}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (state === "already_verified") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mb-1" />
          <CardTitle>Already verified</CardTitle>
          <CardDescription>Your email address was already confirmed.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href={user ? "/" : "/login"}>
              {user ? "Go to my abstracts" : "Sign in"}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="h-10 w-10 text-red-500 mb-1" />
          <CardTitle>Verification failed</CardTitle>
          <CardDescription>{errorMsg || "The link may have expired or already been used."}</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-3">
          {user && !user.email_verified && (
            resent ? (
              <p className="text-sm text-green-600">A new verification email has been sent.</p>
            ) : (
              <Button variant="outline" onClick={handleResend} loading={resending}>
                Send a new link
              </Button>
            )
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-indigo-600 hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // state === "pending" — just registered, no token yet
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailOpen className="h-10 w-10 text-indigo-500 mb-1" />
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to <strong>{user?.email ?? "your email address"}</strong>.
          Click the link to activate your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-3">
        <p className="text-sm text-slate-500">
          The link expires in 72 hours. Didn't receive it? Check your spam folder or request a new one.
        </p>
        {resent ? (
          <p className="text-sm text-green-600 font-medium">A new verification email has been sent.</p>
        ) : (
          <Button variant="outline" onClick={handleResend} loading={resending} disabled={!user}>
            Resend verification email
          </Button>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          Continue without verifying
        </Link>
      </CardFooter>
    </Card>
  );
}
