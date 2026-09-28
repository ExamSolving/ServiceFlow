import { z } from "zod";

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must contain at least 2 characters")
      .max(80, "Full name is too long"),

    companyName: z
      .string()
      .trim()
      .min(2, "Company name must contain at least 2 characters")
      .max(120, "Company name is too long"),

    email: z.string().trim().email("Enter a valid email address"),

    password: z
      .string()
      .min(8, "Password must contain at least 8 characters")
      .max(128, "Password is too long"),

    confirmPassword: z.string(),

    termsAccepted: z.boolean().refine((value) => value, {
      message: "You must accept the terms",
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],

    message: "Passwords do not match",
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const provisionOwnerSchema = z.object({
  fullName: z.string().trim().min(2).max(80),

  companyName: z.string().trim().min(2).max(120),
});
