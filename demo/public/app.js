const $ = (id) => document.getElementById(id);

function show(id, value, isError = false) {
  const node = $(id);
  node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  node.classList.toggle("bad", Boolean(isError));
  node.classList.toggle("ok", !isError);
}

async function post(url, { body, headers } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

$("t1-get").addEventListener("click", async () => {
  const result = await post("/api/task1/call", {
    body: { name: "get_customer_record", arguments: { customer_id: $("t1-id").value } },
  });
  show("t1-out", result.body, result.status >= 400);
});

$("t1-refund").addEventListener("click", async () => {
  const result = await post("/api/task1/call", {
    body: {
      name: "trigger_refund",
      arguments: {
        customer_id: $("t1-id").value,
        amount: Number($("t1-amount").value),
        reason: $("t1-reason").value,
      },
    },
  });
  show("t1-out", result.body, result.status >= 400);
});

$("t1-bad").addEventListener("click", async () => {
  const result = await post("/api/task1/call", {
    body: { name: "get_customer_record", arguments: { customer_id: "not-a-customer" } },
  });
  show("t1-out", result.body, true);
});

async function task2(method, params) {
  const token = $("t2-token").value;
  return post("/api/task2/mcp", {
    headers: { authorization: `Bearer ${token}` },
    body: { jsonrpc: "2.0", id: Date.now(), method, params },
  });
}

$("t2-list").addEventListener("click", async () => {
  const result = await task2("tools/list", {});
  show("t2-out", result.body, result.status >= 400);
});

$("t2-admin").addEventListener("click", async () => {
  const result = await task2("tools/call", { name: "admin_list_customers", arguments: {} });
  show("t2-out", result.body, result.status >= 400 || Boolean(result.body?.error));
});

$("t2-customer").addEventListener("click", async () => {
  const result = await task2("tools/call", {
    name: "get_customer_record",
    arguments: { customer_id: "CUST-10001" },
  });
  show("t2-out", result.body, result.status >= 400);
});

$("t3-go").addEventListener("click", async () => {
  $("t3-out").textContent = "";
  const response = await fetch("/api/task3/redact/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: $("t3-text").value }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    $("t3-out").textContent = acc;
  }
  $("t3-out").classList.add("ok");
});

$("t4-ok").addEventListener("click", () => simulate("ok"));
$("t4-429").addEventListener("click", () => simulate("429"));
$("t4-timeout").addEventListener("click", () => simulate("timeout"));

async function simulate(primary) {
  await post("/api/task4/simulate", { body: { primary } });
  $("t4-mode").textContent = `Primary: ${primary}`;
}

$("t4-send").addEventListener("click", async () => {
  const result = await post("/api/task4/chat", {
    headers: { authorization: `Bearer ${$("t4-tenant").value}` },
    body: { prompt: $("t4-prompt").value, tokens: Number($("t4-tokens").value) },
  });
  show("t4-out", result.body, result.status >= 400);
});
