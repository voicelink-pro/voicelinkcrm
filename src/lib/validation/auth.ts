import { z } from "zod"

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Podaj adres e-mail.")
    .email("Podaj prawidłowy adres e-mail."),
  password: z.string().min(1, "Podaj hasło."),
  returnTo: z.string().optional(),
})

export const resetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Podaj adres e-mail.")
    .email("Podaj prawidłowy adres e-mail."),
})

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków."),
    confirmPassword: z.string().min(1, "Powtórz hasło."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Hasła nie są takie same.",
  })

export type AuthFormState = {
  error?: string
  message?: string
  fieldErrors?: {
    email?: string
    password?: string
    confirmPassword?: string
  }
}

export function fieldErrorsFromZod(error: z.ZodError) {
  const fieldErrors: AuthFormState["fieldErrors"] = {}

  for (const issue of error.issues) {
    const field = issue.path[0]

    if (
      (field === "email" || field === "password" || field === "confirmPassword") &&
      !fieldErrors[field]
    ) {
      fieldErrors[field] = issue.message
    }
  }

  return fieldErrors
}
