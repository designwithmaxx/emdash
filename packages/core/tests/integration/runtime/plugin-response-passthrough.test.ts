import { randomUUID } from "node:crypto";

import { SqliteDialect } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeSqliteCompatDatabase as Database } from "#node-sqlite";

import {
	EmDashRuntime,
	type RuntimeDependencies,
	type SandboxedPluginEntry,
} from "../../../src/emdash-runtime.js";
import { definePlugin, definePluginRoute } from "../../../src/plugins/define-plugin.js";
import { dispatchPluginApiRequest } from "../../../src/plugins/http-route-dispatch.js";
import type { SandboxedPluginInstance } from "../../../src/plugins/sandbox/types.js";
import type { PluginRoute } from "../../../src/plugins/types.js";

const runtimes: EmDashRuntime[] = [];

afterEach(async () => {
	await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
});

async function invokeTrusted(route: PluginRoute, request: Request) {
	const runtime = await EmDashRuntime.create({
		config: { database: { entrypoint: randomUUID(), config: {}, type: "sqlite" } },
		plugins: [definePlugin({ id: "resp-demo", version: "1.0.0", routes: { test: route } })],
		createDialect: () => new SqliteDialect({ database: new Database(":memory:") }),
		createStorage: null,
		sandboxEnabled: false,
		sandboxedPluginEntries: [],
		createSandboxRunner: null,
	});
	runtimes.push(runtime);
	return dispatchPluginApiRequest({
		runtime,
		pluginId: "resp-demo",
		path: "/test",
		request,
	});
}

async function invokeSandboxed(
	invokeRoute: SandboxedPluginInstance["invokeRoute"],
	request: Request,
) {
	let currentInvokeRoute = invokeRoute;
	const runner = {
		isAvailable: () => true,
		isHealthy: () => true,
		load: vi.fn().mockResolvedValue({
			invokeHook: vi.fn(),
			invokeRoute: (...args: Parameters<SandboxedPluginInstance["invokeRoute"]>) =>
				currentInvokeRoute(...args),
		}),
		setEmailSend: vi.fn(),
		terminateAll: vi.fn(),
	};
	const entry: SandboxedPluginEntry = {
		id: "sandbox-demo",
		version: "1.0.0",
		options: {},
		code: "",
		capabilities: [],
		allowedHosts: [],
		storage: {},
		routes: [{ name: "test", public: true }],
	};
	const deps: RuntimeDependencies = {
		config: { database: { entrypoint: randomUUID(), config: {}, type: "sqlite" } },
		plugins: [],
		createDialect: () => new SqliteDialect({ database: new Database(":memory:") }),
		createStorage: null,
		sandboxEnabled: true,
		sandboxedPluginEntries: [entry],
		// eslint-disable-next-line typescript/no-explicit-any -- test fake matches the SandboxRunner shape create.test.ts already uses
		createSandboxRunner: (() => runner) as any,
	};
	const runtime = await EmDashRuntime.create(deps);
	runtimes.push(runtime);
	return dispatchPluginApiRequest({
		runtime,
		pluginId: "sandbox-demo",
		path: "/test",
		request,
	});
}

describe("trusted plugin route raw Response passthrough", () => {
	it("returns a trusted handler's Response verbatim (status, Set-Cookie, body)", async () => {
		const response = await invokeTrusted(
			definePluginRoute({
				public: true,
				handler: async () =>
					new Response("x", {
						status: 201,
						headers: { "Set-Cookie": "a=b", "Content-Type": "text/plain" },
					}),
			}),
			new Request("https://example.com/_emdash/api/plugins/resp-demo/test", { method: "POST" }),
		);
		expect(response.status).toBe(201);
		expect(response.headers.get("Set-Cookie")).toBe("a=b");
		expect(await response.text()).toBe("x");
	});

	it("still apiSuccess-wraps a plain object result from a trusted handler", async () => {
		const response = await invokeTrusted(
			definePluginRoute({
				public: true,
				handler: async () => ({ ok: true }),
			}),
			new Request("https://example.com/_emdash/api/plugins/resp-demo/test", { method: "POST" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, data: { ok: true } });
	});

	it("leaves sandboxed wire results unchanged (no Response objects cross the wire)", async () => {
		const response = await invokeSandboxed(
			vi.fn(async () => ({ message: "sandbox-data" })),
			new Request("https://example.com/_emdash/api/plugins/sandbox-demo/test", { method: "POST" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			data: { message: "sandbox-data" },
		});
	});
});
