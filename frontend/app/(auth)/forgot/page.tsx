"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { auth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, User } from "lucide-react";

// ── Forgot username ────────────────────────────────────────────────────────────

const usernameSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type UsernameForm = z.infer<typeof usernameSchema>;

function ForgotUsernameCard() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<UsernameForm>({ resolver: zodResolver(usernameSchema) });

  const onSubmit = async (data: UsernameForm) => {
    await auth.forgotUsername(data.email);
    setSent(true);
  };

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <User className="h-8 w-8 text-indigo-500 mb-1" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If any accounts are registered to that address, we&apos;ve sent a list of usernames.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" asChild className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <User className="h-8 w-8 text-indigo-500 mb-1" />
        <CardTitle>Forgot username</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a list of usernames associated with it.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Email address</Label>
            <Input
              id="forgot-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send username reminder
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ── Forgot password ────────────────────────────────────────────────────────────

const passwordSchema = z.object({
  username: z.string().min(1, "Username is required"),
});
type PasswordForm = z.infer<typeof passwordSchema>;

function ForgotPasswordCard() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = async (data: PasswordForm) => {
    await auth.forgotPassword(data.username);
    setSent(true);
  };

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <KeyRound className="h-8 w-8 text-indigo-500 mb-1" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If that username exists, we&apos;ve sent a password reset link to the associated email address.
            The link expires in 1 hour.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" asChild className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <KeyRound className="h-8 w-8 text-indigo-500 mb-1" />
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your username and we&apos;ll send a reset link to the associated email address.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-username">Username</Label>
            <Input
              id="forgot-username"
              type="text"
              placeholder="your_username"
              autoComplete="username"
              error={errors.username?.message}
              {...register("username")}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ForgotPage() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Account recovery</h1>
        <p className="mt-1 text-sm text-slate-500">
          <Link href="/login" className="text-indigo-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <ForgotUsernameCard />
        <ForgotPasswordCard />
      </div>
    </div>
  );
}
