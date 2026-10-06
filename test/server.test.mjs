import assert from "node:assert/strict";
import { test } from "node:test";
import { startServer } from "../server.mjs";

test("the server serves its pages and API, and nothing else", async () => {
	const { server, url } = await startServer({ port: 0 });
	try {
		const page = await fetch(`${url}/`);
		assert.equal(page.status, 200);
		assert.match(await page.text(), /Tidewell Goods/);
		assert.equal((await fetch(`${url}/admin`)).status, 200);
		assert.equal((await fetch(`${url}/api/products`)).status, 200);
		assert.equal((await fetch(`${url}/server.mjs`)).status, 404, "source files are not served");
		assert.equal((await fetch(`${url}/../package.json`)).status, 404, "control: a path outside the allow-list is not found");
		const bad = await fetch(`${url}/api/events`, { method: "POST", body: "{not json" });
		assert.equal(bad.status, 400);
	} finally {
		server.close();
	}
});
