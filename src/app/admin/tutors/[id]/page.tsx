import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { requirePermission } from "@/server/context";
import { db } from "@/server/db";
import { mediaOptions } from "@/server/media/service";
import { NotFoundError } from "@/server/errors";
import { can } from "@/server/permissions/authorize";
import { getTutorProfile, MODE_LABELS, TEACHING_MODES, tutorFilterOptions } from "@/server/tutors/service";
import { decideTutorAction, deleteTutorAction, publishTutorAction, updateTutorAction, updateTutorDetailsAction } from "../../actions";

export const metadata = { title: "Tutor" };

const STATUS: Record<string, string> = { PENDING: "Awaiting review", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved", REJECTED: "Rejected" };

export default async function AdminTutor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requirePermission("tutors.review_applications", `/admin/tutors/${id}`);
  const tutor = await getTutorProfile(db(), s.actor, id).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!tutor) notFound();
  const options = await tutorFilterOptions(db());
  const canDecide = can(s.actor, "tutors.approve");
  const pictures = await mediaOptions(db(), s.actor);

  const fields: FieldSpec[] = [
    { name: "displayName", label: "Public name", required: true, defaultValue: tutor.displayName ?? "", hint: "First name and last initial, e.g. Ama M. No contact details." },
    { name: "photoPath", label: "Photo", type: "select", options: [{ value: "", label: "No photo (show initials)" }, ...pictures], defaultValue: tutor.photoPath ?? "", hint: "Upload pictures under Media. Only use a photo with the tutor's consent." },
    { name: "headline", label: "Headline", required: true, defaultValue: tutor.headline ?? "", hint: "One line, e.g. Mathematics and Science specialist, SHS and BECE." },
    { name: "bio", label: "Biography", type: "textarea", required: true, rows: 6, defaultValue: tutor.bio ?? "" },
    { name: "subjects", label: "Subjects", required: true, defaultValue: tutor.subjects.join(", "), hint: "Separate with commas." },
    { name: "levelKeys", label: "Levels", type: "checkboxes", options: options.levels.map((l) => ({ value: l.key, label: l.name })), defaultValue: tutor.levelKeys.join(",") },
    { name: "curriculumKeys", label: "Curricula", type: "checkboxes", options: options.curricula.map((c) => ({ value: c.key, label: c.name })), defaultValue: tutor.curriculumKeys.join(",") },
    { name: "modes", label: "Lessons", type: "checkboxes", options: TEACHING_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] })), defaultValue: tutor.modes.join(",") },
    { name: "areas", label: "Areas", defaultValue: tutor.areas ?? "" },
    { name: "yearsExperience", label: "Years of experience", type: "number", defaultValue: tutor.yearsExperience ?? "" },
    { name: "sortOrder", label: "Order on the Tutors page (lowest first)", type: "number", defaultValue: tutor.sortOrder },
    { name: "adminNotes", label: "Internal notes (never public)", type: "textarea", defaultValue: tutor.adminNotes ?? "" },
  ];

  return (
    <>
      <Link href="/admin/tutors" className="text-sm underline">← All tutors</Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{tutor.fullName}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-navy/10 px-3 py-1">{STATUS[tutor.status]}</span>
        {tutor.status === "APPROVED" ? <span className={`rounded-full px-3 py-1 ${tutor.isPublished ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{tutor.isPublished ? "On website" : "Hidden"}</span> : null}
        {tutor.isPublished ? <Link href={`/tutors/${tutor.id}`} className="underline">View public page</Link> : null}
      </p>

      <section className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Private details</h2>
        <p className="mt-1 text-sm text-navy/70">
          Only staff see these. {tutor.source === "admin" ? "Added by staff" : "Website application"} on {tutor.createdAt.toLocaleString("en-GB")}.
        </p>
        <div className="mt-4 max-w-2xl">
          <ActionForm
            action={updateTutorDetailsAction}
            hidden={{ tutorId: tutor.id }}
            submitLabel="Save private details"
            fields={[
              { name: "fullName", label: "Full name", required: true, defaultValue: tutor.fullName },
              { name: "email", label: "Email", type: "email", required: true, defaultValue: tutor.email },
              { name: "phone", label: "Phone", type: "tel", defaultValue: tutor.phone ?? "" },
              { name: "qualifications", label: "Qualifications", type: "textarea", defaultValue: tutor.qualifications },
              { name: "experience", label: "Teaching experience", type: "textarea", defaultValue: tutor.experience },
              { name: "availability", label: "Availability", defaultValue: tutor.availability },
            ]}
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">Public profile</h2>
        <p className="mt-1 text-sm text-navy/70">This is what visitors and Kaitlyn can see once the profile is approved and on the website.</p>
        <div className="mt-4 max-w-2xl">
          <ActionForm action={updateTutorAction} hidden={{ tutorId: tutor.id }} fields={fields} submitLabel="Save profile" />
        </div>
      </section>

      {canDecide ? (
        <section className="mt-6 rounded-2xl border border-navy/10 bg-white/70 p-6">
          <h2 className="text-xl font-semibold">Decision</h2>
          <p className="mt-1 text-sm text-navy/70">Save the profile first. Approving puts it on the website and emails the applicant. The message is included in that email.</p>
          <div className="mt-4 grid max-w-2xl gap-6">
            {(["APPROVED", "CHANGES_REQUESTED", "REJECTED"] as const)
              .filter((d) => d !== tutor.status)
              .map((d) => (
                <ActionForm
                  key={d}
                  action={decideTutorAction}
                  hidden={{ tutorId: tutor.id, decision: d }}
                  fields={[{ name: "message", label: d === "CHANGES_REQUESTED" ? "What needs to change (required)" : "Message to the applicant (optional)", type: "textarea", rows: 3 }]}
                  submitLabel={d === "APPROVED" ? "Approve and publish" : d === "REJECTED" ? "Reject" : "Request changes"}
                  tone={d === "REJECTED" ? "danger" : d === "APPROVED" ? "primary" : "quiet"}
                />
              ))}
            {tutor.status === "APPROVED" ? (
              <ActionForm
                action={publishTutorAction}
                hidden={{ tutorId: tutor.id, publish: String(!tutor.isPublished) }}
                fields={[]}
                submitLabel={tutor.isPublished ? "Hide from website" : "Show on website"}
                tone="quiet"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {canDecide ? (
        <section className="mt-6 rounded-2xl border border-red-200 bg-white/70 p-6">
          <h2 className="text-xl font-semibold">Delete this tutor</h2>
          <p className="mt-1 text-sm text-navy/70">Permanently removes the application and profile, for example to honour a deletion request. This cannot be undone. Use Reject or Hide if you only want it off the website.</p>
          <div className="mt-4 max-w-sm">
            <ActionForm action={deleteTutorAction} hidden={{ tutorId: tutor.id }} fields={[{ name: "confirm", label: "Type delete to confirm" }]} submitLabel="Delete permanently" tone="danger" />
          </div>
        </section>
      ) : null}
    </>
  );
}
