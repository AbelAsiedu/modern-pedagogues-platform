"use server";

import { runAction, type ActionState } from "@/server/action-result";
import { requestContext, emailDeps } from "@/server/context";
import { submitApplication } from "@/server/tutors/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function applyAsTutorAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await submitApplication(
      emailDeps(),
      {
        fullName: str(form, "fullName"),
        email: str(form, "email"),
        phone: str(form, "phone"),
        qualifications: str(form, "qualifications"),
        experience: str(form, "experience"),
        availability: str(form, "availability"),
        bio: str(form, "bio"),
        subjects: str(form, "subjects"),
        levelKeys: form.getAll("levelKeys").map(String),
        curriculumKeys: form.getAll("curriculumKeys").map(String),
        modes: form.getAll("modes").map(String),
        areas: str(form, "areas"),
        yearsExperience: str(form, "yearsExperience"),
        consent: form.get("consent") === "on",
      },
      await requestContext(),
    );
    return { ok: true, message: "Thank you. We have received your application and emailed you a confirmation." };
  });
}
