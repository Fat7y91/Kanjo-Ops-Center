import { NextResponse } from "next/server";

import { apiError } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { uploadObject } from "@/lib/profile/storage";
import {
  admitUpload,
  isUploadTarget,
  objectPath,
  UploadError,
} from "@/lib/profile/upload";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Guarded upload endpoint for avatars and capital receipts.
 *
 * The browser posts multipart form data; the server decides the bucket, the
 * object path and the content type. A client can choose only `target`, and the
 * file is sniffed before it is forwarded, so a renamed executable cannot land
 * in a public bucket.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  const target = form.get("target");
  const file = form.get("file");

  if (!isUploadTarget(target) || !(file instanceof File)) {
    return NextResponse.json(
      { error: "ملف أو وجهة غير صالحة.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  try {
    const admission = await admitUpload(target, file);
    const path = objectPath(session.user.id, admission.extension);
    const stored = await uploadObject(
      admission.bucket,
      path,
      new Blob([admission.bytes], { type: admission.mime }),
      admission.mime,
    );

    return NextResponse.json(
      { path, url: admission.bucket === "avatars" ? stored : null },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error);
  }
}
