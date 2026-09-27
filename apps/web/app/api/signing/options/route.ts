import { UUID } from "@/lib/catalog";
import {
  signingDeps,
  signingError,
  signingOrigin,
  signingResponse,
  signingUser,
} from "@/lib/signing";
import { SigningError, signingOptions } from "@/lib/signing-service";

/** T12.2: a 2-minute challenge `ct1:{H}:{N}` over the stored contract body. */
export async function POST(request: Request) {
  try {
    const origin = signingOrigin(request);
    const user = await signingUser();
    const body = await request.json().catch(() => null);
    const versionId = body?.contractVersionId;
    if (typeof versionId !== "string" || !UUID.test(versionId))
      throw new SigningError("invalid_request", 400);
    return signingResponse(
      await signingOptions(signingDeps(origin), user.id, versionId),
    );
  } catch (error) {
    return signingError(error);
  }
}
