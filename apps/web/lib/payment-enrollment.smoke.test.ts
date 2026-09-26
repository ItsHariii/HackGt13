// Opt-in provider integration. Uses only the public sandbox test card; no real PAN.
import { createServer } from "node:http";
import { VisaEnrollment } from "@cartel/payments";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it.skipIf(process.env.VISA_ENROLLMENT_SMOKE !== "1")(
  "Microform hosted fields enroll a test card without sending PAN to our server",
  async () => {
    if (process.env.VISA_ACCEPTANCE_RUN_ENV !== "apitest.cybersource.com")
      throw new Error("sandbox_required");
    const visa = new VisaEnrollment({
      runEnvironment: "apitest.cybersource.com",
      merchantId: process.env.VISA_ACCEPTANCE_MERCHANT_ID ?? "",
      keyId: process.env.VISA_ACCEPTANCE_KEY_ID ?? "",
      secretKey: process.env.VISA_ACCEPTANCE_SECRET_KEY ?? "",
    });
    let context: Awaited<ReturnType<VisaEnrollment["captureContext"]>>;
    let serverSawPan = false;
    const server = createServer(async (request, response) => {
      if (request.method === "POST" && request.url === "/enroll") {
        let body = "";
        for await (const chunk of request) body += String(chunk);
        serverSawPan ||= body.includes("4111111111111111");
        try {
          const input = JSON.parse(body);
          const enrolled = await visa.enroll(
            input.token,
            {
              firstName: "Test",
              lastName: "Buyer",
              address1: "1 Test Merchant Way",
              locality: "Atlanta",
              administrativeArea: "GA",
              postalCode: "30332",
              country: "US",
              email: "test@example.com",
            },
            `enroll-${crypto.randomUUID()}`,
          );
          response
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify(enrolled));
        } catch {
          response.writeHead(502).end("Enrollment failed");
        }
        return;
      }
      response
        .writeHead(200, { "content-type": "text/html" })
        .end(`<!doctype html><html><body><div id="number"></div><div id="security"></div><button id="save">Save test card</button><output id="result"></output><script src="${context.clientLibrary}" integrity="${context.clientLibraryIntegrity}" crossorigin="anonymous"></script><script>
      const microform = new Flex(${JSON.stringify(context.captureContext)}).microform();
      microform.createField('number').load('#number'); microform.createField('securityCode').load('#security');
      document.querySelector('#save').onclick = () => microform.createToken({expirationMonth:'12',expirationYear:'2031'}, async (error,token) => {
        if(error) { document.querySelector('#result').textContent='token_failed';return; }
        const r = await fetch('/enroll',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
        document.querySelector('#result').textContent=r.ok ? JSON.stringify(await r.json()) : 'enrollment_failed';
      });
    </script></body></html>`);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no_port");
    const origin = `http://localhost:${address.port}`;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      context = await visa.captureContext(origin);
      browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROME_PATH
          ? { executablePath: process.env.CHROME_PATH }
          : {}),
      });
      const page = await browser.newPage();
      await page.goto(origin);
      await page
        .frameLocator("#number iframe")
        .locator('input[name="number"]')
        .fill("4111111111111111");
      await page
        .frameLocator("#security iframe")
        .locator('input[name="securityCode"]')
        .fill("123");
      await page.getByRole("button", { name: "Save test card" }).click();
      await expect
        .poll(() => page.locator("#result").textContent(), { timeout: 30000 })
        .not.toBe("");
      const result = await page.locator("#result").textContent();
      expect(result).not.toBe("token_failed");
      expect(result).not.toBe("enrollment_failed");
      expect(JSON.parse(result ?? "{}")).toMatchObject({
        last4: "1111",
        brand: "Visa",
        expMonth: 12,
        expYear: 2031,
      });
      expect(serverSawPan).toBe(false);
    } finally {
      await browser?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  90000,
);
