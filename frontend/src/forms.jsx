import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
const emptySource = () => ({
  kind: "gas",
  transport: "rpc",
  decimals: 9,
  args: [],
  index: 0,
});
const emptyTx = () => ({ from: "", to: "", value: "0x0", data: "0x" });
function Control({ label, value, onChange, type = "text", options, help }) {
  return (
    <label className="control">
      <span>{label}</span>
      {options ? (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              type === "number" ? Number(e.target.value) : e.target.value,
            )
          }
        />
      )}
      {help && <small>{help}</small>}
    </label>
  );
}
function JsonInput({ label, value, onChange }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  return (
    <label className="control">
      <span>{label}</span>
      <textarea
        className="code"
        value={text}
        rows={3}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            e.target.setCustomValidity("");
            setError("");
          } catch {
            e.target.setCustomValidity("Enter valid JSON before continuing.");
            setError("Enter valid JSON before continuing.");
          }
        }}
      />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
export function SourceEditor({ value, onChange, label = "Chain source" }) {
  const s = value || emptySource();
  const set = (k, v) => onChange({ ...s, [k]: v });
  return (
    <fieldset className="source-editor">
      <legend>{label}</legend>
      <div className="form-pair">
        <Control
          label="Read"
          value={s.kind}
          options={["gas", "balance", "block", "contract"].map((x) => [
            x,
            {
              gas: "Gas price",
              balance: "Native balance",
              block: "Block number",
              contract: "Contract function",
            }[x],
          ])}
          onChange={(v) =>
            onChange({
              ...s,
              kind: v,
              decimals: v === "gas" ? 9 : v === "balance" ? 18 : 0,
            })
          }
        />
        <Control
          label="Connection"
          value={s.transport || "rpc"}
          options={["rpc", "mcp", "skill"].map((x) => [
            x,
            {
              rpc: "Pharos RPC",
              mcp: "Chain MCP",
              skill: "SkillEngine / Foundry",
            }[x],
          ])}
          onChange={(v) => set("transport", v)}
        />
      </div>
      {["balance", "contract"].includes(s.kind) && (
        <Control
          label={s.kind === "balance" ? "Account address" : "Contract address"}
          value={s.address || ""}
          onChange={(v) => set("address", v)}
        />
      )}
      {s.kind === "contract" && (
        <>
          <Control
            label="Function ABI"
            value={s.abi?.[0] || ""}
            help="Example: function totalAssets() view returns (uint256)"
            onChange={(v) => set("abi", [v])}
          />
          <Control
            label="Function name"
            value={s.function || ""}
            onChange={(v) => set("function", v)}
          />
          <JsonInput
            label="Arguments (in ABI order)"
            value={s.args || []}
            onChange={(v) => set("args", v)}
          />
          <Control
            label="Output index"
            type="number"
            value={s.index || 0}
            onChange={(v) => set("index", v)}
          />
        </>
      )}
      <Control
        label="Decimals"
        type="number"
        value={s.decimals ?? 0}
        help={
          s.kind === "gas"
            ? "9 displays gas price in gwei."
            : "Raw integer divided by 10 to this power."
        }
        onChange={(v) => set("decimals", v)}
      />
    </fieldset>
  );
}
export function TransactionEditor({
  value,
  onChange,
  label = "Transaction",
  account,
}) {
  const tx = value || emptyTx(),
    set = (key, v) => onChange({ ...tx, [key]: v });
  return (
    <fieldset className="source-editor">
      <legend>{label}</legend>
      <Control
        label="Sender"
        value={tx.from}
        onChange={(v) => set("from", v)}
      />
      {account && (
        <button
          type="button"
          className="text-button"
          onClick={() => set("from", account)}
        >
          Use connected account
        </button>
      )}
      <Control
        label="Destination"
        value={tx.to}
        onChange={(v) => set("to", v)}
      />
      <Control
        label="Native value (wei, hexadecimal)"
        value={tx.value}
        onChange={(v) => set("value", v)}
      />
      <Control
        label="Calldata"
        value={tx.data}
        onChange={(v) => set("data", v)}
      />
    </fieldset>
  );
}
function Rows({ items, onChange, create, render, label }) {
  return (
    <div className="repeatable">
      {items.map((item, index) => (
        <div className="repeatable-row" key={index}>
          <div className="repeatable-heading">
            <span>
              {label} {index + 1}
            </span>
            <button
              type="button"
              className="icon"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {render(
            item,
            (value) => onChange(items.map((v, i) => (i === index ? value : v))),
            index,
          )}
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => onChange([...items, create()])}
      >
        <Plus size={14} />
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}
export function FeatureField({ field, value, onChange, moduleId, account }) {
  const structured =
    typeof value === "string" && field.type === "json"
      ? JSON.parse(value)
      : value;
  const change = (v) =>
    onChange(field.type === "json" ? JSON.stringify(v, null, 2) : v);
  if (field.name === "conditions")
    return (
      <Rows
        label="Condition"
        items={structured}
        onChange={change}
        create={() => ({
          name: "",
          source: emptySource(),
          operator: "gt",
          threshold: "0",
        })}
        render={(c, set) => (
          <>
            <Control
              label="Condition name"
              value={c.name}
              onChange={(v) => set({ ...c, name: v })}
            />
            <SourceEditor
              value={c.source}
              onChange={(v) => set({ ...c, source: v })}
            />
            <div className="form-pair">
              <Control
                label="Comparison"
                value={c.operator}
                options={["gt", "gte", "lt", "lte", "eq"].map((x) => [
                  x,
                  {
                    gt: "Greater than",
                    gte: "At least",
                    lt: "Less than",
                    lte: "At most",
                    eq: "Equals",
                  }[x],
                ])}
                onChange={(v) => set({ ...c, operator: v })}
              />
              <Control
                label="Threshold"
                value={c.threshold}
                onChange={(v) => set({ ...c, threshold: v })}
              />
            </div>
          </>
        )}
      />
    );
  if (field.name === "steps")
    return (
      <Rows
        label="Step"
        items={structured}
        onChange={change}
        create={() => ({
          name: "",
          transaction: emptyTx(),
          compensation: null,
        })}
        render={(s, set) => (
          <>
            <Control
              label="Step name"
              value={s.name}
              onChange={(v) => set({ ...s, name: v })}
            />
            <TransactionEditor
              value={s.transaction}
              onChange={(v) => set({ ...s, transaction: v })}
              account={account}
            />
            <label className="review">
              <input
                type="checkbox"
                checked={!!s.compensation}
                onChange={(e) =>
                  set({
                    ...s,
                    compensation: e.target.checked ? emptyTx() : null,
                  })
                }
              />
              Configure compensation
            </label>
            {s.compensation && (
              <TransactionEditor
                label="Compensation transaction"
                value={s.compensation}
                onChange={(v) => set({ ...s, compensation: v })}
                account={account}
              />
            )}
          </>
        )}
      />
    );
  if (field.name === "sources")
    return (
      <Rows
        label={moduleId === "yield" ? "Yield source" : "Price source"}
        items={structured}
        onChange={change}
        create={() => ({
          ...emptySource(),
          kind: "contract",
          address: "",
          abi: [],
          function: "",
          label: "",
        })}
        render={(s, set) => (
          <>
            <Control
              label="Source name"
              value={s.label || ""}
              onChange={(v) => set({ ...s, label: v })}
            />
            <SourceEditor value={s} onChange={set} />
          </>
        )}
      />
    );
  if (
    [
      "source",
      "nativePrice",
      "collateral",
      "debt",
      "health",
      "contract",
    ].includes(field.name) &&
    field.type === "json"
  )
    return (
      <SourceEditor label={field.label} value={structured} onChange={change} />
    );
  if (field.name === "transaction")
    return (
      <>
        <label className="control">
          <span>{field.label}</span>
        </label>
        {moduleId === "arbitrage" && (
          <label className="review">
            <input
              type="checkbox"
              checked={!!structured}
              onChange={(e) => change(e.target.checked ? emptyTx() : null)}
            />
            Prepare a reviewed route transaction when profitable
          </label>
        )}
        {(structured || moduleId !== "arbitrage") && (
          <TransactionEditor
            value={structured}
            onChange={change}
            account={account}
          />
        )}
      </>
    );
  if (field.name === "policy")
    return (
      <>
        <Control
          label="Native spend limit"
          value={structured.spendLimit}
          onChange={(v) => change({ ...structured, spendLimit: v })}
        />
        <label className="control">
          <span>Allowed destinations (one per line)</span>
          <textarea
            value={structured.allowlist.join("\n")}
            onChange={(e) =>
              change({
                ...structured,
                allowlist: e.target.value.split("\n").filter(Boolean),
              })
            }
          />
        </label>
        <div className="form-pair">
          <Control
            label="Start hour (UTC)"
            type="number"
            value={structured.startHourUTC}
            onChange={(v) => change({ ...structured, startHourUTC: v })}
          />
          <Control
            label="End hour (UTC)"
            type="number"
            value={structured.endHourUTC}
            onChange={(v) => change({ ...structured, endHourUTC: v })}
          />
        </div>
      </>
    );
  if (field.name === "addresses")
    return (
      <label className="control">
        <span>Watched accounts (at least five, one per line)</span>
        <textarea
          rows={6}
          value={structured.join("\n")}
          onChange={(e) => change(e.target.value.split("\n").filter(Boolean))}
        />
      </label>
    );
  if (field.name === "endpoints")
    return (
      <Rows
        label="Paid API endpoint"
        items={structured}
        onChange={change}
        create={() => ""}
        render={(endpoint, set) => (
          <Control label="HTTPS URL" value={endpoint} onChange={set} help="The endpoint must return an x402 payment challenge." />
        )}
      />
    );
  if (field.name === "vaults")
    return (
      <Rows
        label="Vault"
        items={structured}
        onChange={change}
        create={() => ({ name: "", address: "" })}
        render={(v, set) => (
          <>
            <Control
              label="Vault name"
              value={v.name}
              onChange={(name) => set({ ...v, name })}
            />
            <Control
              label="ERC-4626 address"
              value={v.address}
              onChange={(address) => set({ ...v, address })}
            />
          </>
        )}
      />
    );
  if (field.name === "tokens")
    return (
      <Rows
        label="Token"
        items={structured}
        onChange={change}
        create={() => ({ address: "", threshold: "1000" })}
        render={(v, set) => (
          <>
            <Control
              label="Token contract"
              value={v.address}
              onChange={(address) => set({ ...v, address })}
            />
            <Control
              label="Significant amount"
              value={v.threshold}
              onChange={(threshold) => set({ ...v, threshold })}
            />
          </>
        )}
      />
    );
  if (field.name === "labels")
    return (
      <label className="control"><span>Address labels (one per line: address = name)</span><textarea rows={4} value={Object.entries(structured).map(([address, name]) => `${address} = ${name}`).join("\n")} onChange={(e) => change(Object.fromEntries(e.target.value.split("\n").map((line) => line.split("=").map((v) => v.trim())).filter(([address, name]) => address && name)))} /></label>
    );
  if (field.type === "json")
    return (
      <JsonInput label={field.label} value={structured} onChange={change} />
    );
  if (field.type === "textarea")
    return (
      <label className="control">
        <span>{field.label}</span>
        <textarea
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  return (
    <>
      <Control
        label={field.label}
        value={value}
        type={field.type === "number" ? "number" : "text"}
        options={
          field.type === "select"
            ? field.help
                .split(",")
                .map((x) => [
                  x,
                  x === "index"
                    ? "Pharos Dev Docs (llms.txt)"
                    : x === "mcp"
                      ? "Optional remote MCP"
                      : x,
                ])
            : undefined
        }
        onChange={onChange}
        help={field.type !== "select" ? field.help : undefined}
      />
      {["from", "owner"].includes(field.name) && account && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(account)}
        >
          Use connected account
        </button>
      )}
    </>
  );
}
