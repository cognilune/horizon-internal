import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";
import {
  decodeCreatorApplication,
  type CreatorPayoutApplication,
} from "../lib/kyc";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "workspace",
  project_id: "project",
  environment: "live",
};

function sealed(
  application: CreatorPayoutApplication,
  key: Buffer,
): Uint8Array {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(
    Buffer.from(
      [row.id, row.workspace_id, row.project_id, row.environment].join("/"),
    ),
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(application), "utf8"),
    cipher.final(),
  ]);
  return new Uint8Array(
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
  );
}

test("creator payout submissions decrypt every saved KYC and bank field", () => {
  const previous = {
    current: process.env.KYC_DOCUMENT_KEY_V1,
    legacy: process.env.KYC_DOCUMENT_KEY_LEGACY,
  };
  const key = randomBytes(32);
  const application: CreatorPayoutApplication = {
    fullName: "Creator Test",
    businessName: "Studio Test",
    businessType: "Proprietorship",
    registeredAddress: "Test registered address",
    phone: "9999999999",
    businessDetails: "Design services",
    email: "creator@example.test",
    beneficiary: "Creator Test",
    accountNumber: "123456789012",
    ifsc: "ABCD0001234",
    consent: "on",
    identity: {
      type: "aadhaar",
      number: "234567890123",
      front: { type: "image/png", base64: "aW1hZ2U=" },
      back: { type: "image/jpeg", base64: "aW1hZ2U=" },
    },
  };
  try {
    process.env.KYC_DOCUMENT_KEY_V1 = key.toString("hex");
    delete process.env.KYC_DOCUMENT_KEY_LEGACY;
    assert.deepEqual(
      decodeCreatorApplication({
        ...row,
        sealed_application: sealed(application, key),
      }),
      application,
    );
  } finally {
    if (previous.current === undefined) delete process.env.KYC_DOCUMENT_KEY_V1;
    else process.env.KYC_DOCUMENT_KEY_V1 = previous.current;
    if (previous.legacy === undefined) delete process.env.KYC_DOCUMENT_KEY_LEGACY;
    else process.env.KYC_DOCUMENT_KEY_LEGACY = previous.legacy;
  }
});
test("creator payout decryption supports an explicit legacy key only", () => {
  const previous = {
    current: process.env.KYC_DOCUMENT_KEY_V1,
    legacy: process.env.KYC_DOCUMENT_KEY_LEGACY,
  };
  const current = randomBytes(32);
  const legacy = randomBytes(32);
  const application = { fullName: "Legacy Creator" };
  try {
    process.env.KYC_DOCUMENT_KEY_V1 = current.toString("hex");
    process.env.KYC_DOCUMENT_KEY_LEGACY = legacy.toString("hex");
    assert.equal(
      decodeCreatorApplication({
        ...row,
        sealed_application: sealed(application, legacy),
      }).fullName,
      "Legacy Creator",
    );
    delete process.env.KYC_DOCUMENT_KEY_LEGACY;
    assert.throws(
      () =>
        decodeCreatorApplication({
          ...row,
          sealed_application: sealed(application, legacy),
        }),
      /could not be decrypted/,
    );
  } finally {
    if (previous.current === undefined) delete process.env.KYC_DOCUMENT_KEY_V1;
    else process.env.KYC_DOCUMENT_KEY_V1 = previous.current;
    if (previous.legacy === undefined) delete process.env.KYC_DOCUMENT_KEY_LEGACY;
    else process.env.KYC_DOCUMENT_KEY_LEGACY = previous.legacy;
  }
});
