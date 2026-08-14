window.__ModuleLoader__.load({
	id: "deepseek-harness-openai-oauth",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client.tsx
		const ENDPOINT = "/api/codex-oauth";
		const copy = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? {
			title: "OpenAI OAuth",
			intro: "使用 ChatGPT 账户连接 GPT 模型。登录和 token 刷新完全由本机 Codex app-server 管理。",
			connected: "已连接",
			disconnected: "尚未连接",
			login: "使用 ChatGPT 登录",
			waiting: "等待浏览器授权…",
			logout: "退出登录",
			refresh: "刷新状态",
			models: "可用模型",
			noModels: "登录后将显示账户可用的模型。",
			popup: "如果登录页没有自动打开，请点击这里继续。"
		} : {
			title: "OpenAI OAuth",
			intro: "Connect GPT models with your ChatGPT account. The local Codex app-server owns login and token refresh.",
			connected: "Connected",
			disconnected: "Not connected",
			login: "Sign in with ChatGPT",
			waiting: "Waiting for browser authorization…",
			logout: "Sign out",
			refresh: "Refresh status",
			models: "Available models",
			noModels: "Models available to your account appear after sign-in.",
			popup: "If the sign-in page did not open, continue here."
		};
		async function request(path = "", method = "GET") {
			const response = await fetch(`${ENDPOINT}${path}`, {
				method,
				headers: { accept: "application/json" },
				credentials: "same-origin"
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error ?? `HTTP ${String(response.status)}`);
			return body;
		}
		const styles = {
			section: {
				maxWidth: 720,
				padding: "4px 0 32px"
			},
			title: {
				fontSize: 20,
				margin: "0 0 8px"
			},
			intro: {
				color: "var(--text-secondary, #666)",
				lineHeight: 1.6,
				margin: "0 0 20px"
			},
			card: {
				border: "1px solid var(--border-color, #ddd)",
				borderRadius: 12,
				padding: 20
			},
			row: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 16
			},
			status: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontWeight: 600
			},
			dot: {
				width: 9,
				height: 9,
				borderRadius: "50%"
			},
			meta: {
				color: "var(--text-secondary, #666)",
				fontSize: 13,
				marginTop: 6
			},
			actions: {
				display: "flex",
				flexWrap: "wrap",
				gap: 8,
				marginTop: 18
			},
			button: {
				border: "1px solid var(--border-color, #bbb)",
				borderRadius: 8,
				padding: "8px 12px",
				cursor: "pointer",
				background: "var(--surface-color, #fff)",
				color: "inherit"
			},
			primary: {
				background: "var(--primary-color, #2563eb)",
				borderColor: "transparent",
				color: "#fff"
			},
			error: {
				color: "#b42318",
				marginTop: 12
			},
			models: { marginTop: 24 },
			list: {
				margin: "10px 0 0",
				paddingLeft: 20,
				lineHeight: 1.8
			}
		};
		function OpenAiOAuthSection(_props) {
			const [status, setStatus] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [waiting, setWaiting] = (0, react.useState)(false);
			const [authUrl, setAuthUrl] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const refresh = (0, react.useCallback)(async () => {
				try {
					const next = await request();
					setStatus(next);
					setError(void 0);
					if (next.authenticated) {
						setWaiting(false);
						setAuthUrl(void 0);
					}
					return next;
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
					return;
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (!waiting) return;
				const timer = window.setInterval(() => {
					refresh();
				}, 1200);
				return () => {
					window.clearInterval(timer);
				};
			}, [refresh, waiting]);
			const login = async () => {
				const popup = window.open("about:blank", "_blank");
				if (popup !== null) popup.opener = null;
				setBusy(true);
				setError(void 0);
				try {
					const result = await request("/login", "POST");
					if (typeof result.authUrl !== "string") throw new Error("Codex did not return an authentication URL.");
					setAuthUrl(result.authUrl);
					setWaiting(true);
					if (popup !== null) popup.location.href = result.authUrl;
				} catch (reason) {
					popup?.close();
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
				}
			};
			const logout = async () => {
				setBusy(true);
				setError(void 0);
				try {
					await request("/logout", "POST");
					await refresh();
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
				}
			};
			const connected = status?.authenticated === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: styles.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: styles.title,
						children: copy.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.intro,
						children: copy.intro
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: styles.row,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: styles.status,
									role: "status",
									"aria-live": "polite",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
										...styles.dot,
										background: connected ? "#12b76a" : "#98a2b3"
									} }), connected ? copy.connected : copy.disconnected]
								}), connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: styles.meta,
									children: [status.email, status.planType].filter(Boolean).join(" · ")
								}) : null] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.actions,
								children: [connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: styles.button,
									disabled: busy,
									onClick: () => {
										logout();
									},
									children: copy.logout
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: {
										...styles.button,
										...styles.primary
									},
									disabled: busy || waiting,
									onClick: () => {
										login();
									},
									children: waiting ? copy.waiting : copy.login
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: styles.button,
									disabled: busy,
									onClick: () => {
										refresh();
									},
									children: copy.refresh
								})]
							}),
							authUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: authUrl,
								target: "_blank",
								rel: "noreferrer",
								children: copy.popup
							}) }),
							error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: styles.error,
								role: "alert",
								children: error
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.models,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: copy.models }), status?.models.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									style: styles.list,
									children: status.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
										model.name,
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: model.id })
									] }, model.id))
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles.meta,
									children: copy.noModels
								})]
							})
						]
					})
				]
			});
		}
		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "openai-oauth",
				order: 11,
				label: () => "OpenAI OAuth"
			}, OpenAiOAuthSection));
		}
		//#endregion
		exports.OpenAiOAuthSection = OpenAiOAuthSection;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
