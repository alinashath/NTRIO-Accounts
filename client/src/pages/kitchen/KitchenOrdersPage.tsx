import { Apple, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard } from "@/components/design";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import type {
  BreakfastOrderDto,
  BreakfastType,
  EggStyle,
  KitchenDayDto,
  KitchenDayRoomDto,
  RoomExtraOptionDto,
  RoomExtraSelectionDto,
  ShoppingSummaryDto,
} from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const fruitOpts = [
  { id: "watermelon", label: "Water Melon" },
  { id: "apple", label: "Apple" },
  { id: "papaya", label: "Papaya" },
  { id: "orange", label: "Orange" },
] as const;

const eggOpts: DropdownOption[] = [
  { value: "omelette", label: "Omelette" },
  { value: "fried", label: "Fried" },
  { value: "boiled", label: "Boiled" },
  { value: "scrambled", label: "Scrambled" },
];

function ActionBtn({
  label,
  onClick,
  disabled,
  children,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "neutral" | "action";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        tone === "action"
          ? "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-action px-3 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
          : "inline-flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-sm font-semibold text-ink hover:bg-neutral-bg disabled:opacity-50"
      }
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function KitchenOrdersPage() {
  const [date, setDate] = useState(todayYmd);
  const [day, setDay] = useState<KitchenDayDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [orderModal, setOrderModal] = useState<{
    room: KitchenDayRoomDto;
    editing?: BreakfastOrderDto;
  } | null>(null);
  const [extrasRoom, setExtrasRoom] = useState<KitchenDayRoomDto | null>(null);
  const [occRoom, setOccRoom] = useState<KitchenDayRoomDto | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<KitchenDayDto>(`/api/kitchen/day?date=${date}`);
    setDay(data);
  }, [date]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function noteShopping(shopping?: ShoppingSummaryDto) {
    if (!shopping) return;
    if (shopping.buy_line_count === 0) {
      setMsg("Order saved · inventory usage updated · shopping list clear for this date");
    } else {
      setMsg(
        `Order saved · inventory usage updated · shopping list has ${shopping.buy_line_count} line${
          shopping.buy_line_count === 1 ? "" : "s"
        } to buy`,
      );
    }
  }

  async function removeExtraLine(room: KitchenDayRoomDto, stockItemId: string) {
    const lines = (room.extras.selected_lines ?? []).filter((l) => l.stock_item_id !== stockItemId);
    try {
      const res = await apiFetch<{ shopping?: ShoppingSummaryDto }>("/api/kitchen/extras", {
        method: "PUT",
        body: JSON.stringify({
          date,
          room_id: room.id,
          fruits: room.extras.fruits,
          selected_lines: lines.map((l) => ({
            stock_item_id: l.stock_item_id,
            quantity: l.quantity,
          })),
        }),
      });
      noteShopping(res.shopping);
      setMsg("Extra removed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Breakfast orders</h1>
          <p className="mt-1 text-caption">
            Pick a date · use Add breakfast on each room. Configure ingredients under Recipes. Saving updates stock
            Used and shopping list.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Link
            to="/kitchen/recipes"
            className="inline-flex h-input min-h-11 items-center justify-center rounded-sm border border-action px-4 text-sm font-semibold text-action"
          >
            Configure recipes
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? (
        <p className="text-sm font-medium text-credit">
          {msg}{" "}
          <Link to={`/stock/shopping`} className="font-semibold text-action underline">
            Open shopping list
          </Link>
        </p>
      ) : null}

      {(day?.rooms ?? []).map((room) => (
        <PanelCard
          key={room.id}
          title={`Room ${room.number}`}
          caption={`Occupants ${room.occupant_count} · Breakfast guests ${room.breakfast_participants}`}
        >
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            <ActionBtn
              label="Add breakfast"
              tone="action"
              disabled={room.orders.filter((o) => o.status !== "cancelled").length >= 3}
              onClick={() => setOrderModal({ room })}
            >
              <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </ActionBtn>
            <ActionBtn label="Occupants" onClick={() => setOccRoom(room)}>
              <Users className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </ActionBtn>
            <ActionBtn label="Fruits & extras" onClick={() => setExtrasRoom(room)}>
              <Apple className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </ActionBtn>
          </div>

          {room.orders.length === 0 ? (
            <div className="border-t border-border px-4 py-3 space-y-2">
              <p className="text-caption">
                No breakfast orders yet. Tap Add breakfast — occupied rooms are not assumed to need breakfast.
              </p>
              <Button
                type="button"
                className="gap-2"
                disabled={room.orders.filter((o) => o.status !== "cancelled").length >= 3}
                onClick={() => setOrderModal({ room })}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add breakfast for room {room.number}
              </Button>
            </div>
          ) : (
            room.orders.map((o) => (
              <ListRow
                key={o.id}
                primary={`Guest ${o.guest_number} · ${o.breakfast_type} · ${o.egg_style}`}
                secondary={[
                  o.serving_time,
                  o.outside_normal_window ? "Outside window" : null,
                  o.potato ? "potato" : null,
                  o.juice ? "juice" : null,
                  o.tea ? "tea" : null,
                  o.coffee ? "coffee" : null,
                  o.milk ? "milk" : null,
                  o.sugar ? "sugar" : null,
                  o.status,
                  o.special_requests,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                right={
                  <span className="inline-flex min-h-11 min-w-11 items-center justify-center text-action" aria-hidden>
                    <Pencil className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                }
                onClick={() => setOrderModal({ room, editing: o })}
              />
            ))
          )}

          {(room.extras.fruits.length > 0 || (room.extras.selected_lines ?? []).length > 0) && (
            <div className="border-t border-border">
              {room.extras.fruits.length > 0 ? (
                <p className="px-4 py-2 text-caption">Fruits: {room.extras.fruits.join(", ")}</p>
              ) : null}
              {(room.extras.selected_lines ?? []).map((line) => (
                <ListRow
                  key={line.stock_item_id}
                  primary={line.name ?? "Extra"}
                  secondary={[
                    `${line.quantity} ${line.unit ?? ""}`.trim(),
                    line.show_on_kot ? "on KOT" : null,
                    isPancakeOption(line) ? `${line.quantity * 20} pieces` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  right={
                    <button
                      type="button"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                      aria-label={`Remove ${line.name ?? "extra"}`}
                      onClick={() => void removeExtraLine(room, line.stock_item_id)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </PanelCard>
      ))}

      <Modal
        open={!!orderModal}
        title={orderModal?.editing ? "Edit breakfast order" : "New breakfast order"}
        onClose={() => setOrderModal(null)}
      >
        {orderModal ? (
          <OrderForm
            date={date}
            room={orderModal.room}
            servingTimes={day?.serving_times ?? []}
            editing={orderModal.editing}
            usedGuests={orderModal.room.orders
              .filter((o) => o.status !== "cancelled" && o.id !== orderModal.editing?.id)
              .map((o) => o.guest_number)}
            onDone={(shopping) => {
              setOrderModal(null);
              noteShopping(shopping);
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!extrasRoom}
        title={`Room ${extrasRoom?.number ?? ""} fruits & extras`}
        onClose={() => setExtrasRoom(null)}
      >
        {extrasRoom ? (
          <ExtrasForm
            date={date}
            room={extrasRoom}
            options={day?.extra_options ?? []}
            onDone={(shopping) => {
              setExtrasRoom(null);
              noteShopping(shopping);
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!occRoom}
        title={`Room ${occRoom?.number ?? ""} occupants`}
        onClose={() => setOccRoom(null)}
      >
        {occRoom ? (
          <OccupancyForm
            date={date}
            room={occRoom}
            onDone={() => {
              setOccRoom(null);
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function OccupancyForm({
  date,
  room,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  onDone: () => void;
  onError: (s: string) => void;
}) {
  const [count, setCount] = useState(String(room.occupant_count));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/kitchen/occupancy", {
        method: "PUT",
        body: JSON.stringify({
          date,
          room_id: room.id,
          occupant_count: Number(count) || 0,
        }),
      });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Single-date occupants for {date}. For from–to stays, use Occupancy.
      </p>
      <TextField
        label="Occupants"
        type="number"
        min={0}
        max={10}
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function OrderForm({
  date,
  room,
  servingTimes,
  editing,
  usedGuests,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  servingTimes: string[];
  editing?: BreakfastOrderDto;
  usedGuests: number[];
  onDone: (shopping?: ShoppingSummaryDto) => void;
  onError: (s: string) => void;
}) {
  const availableGuests = [1, 2, 3].filter((g) => !usedGuests.includes(g) || g === editing?.guest_number);
  const [guestNumber, setGuestNumber] = useState(String(editing?.guest_number ?? availableGuests[0] ?? 1));
  const [servingTime, setServingTime] = useState(editing?.serving_time ?? "07:30");
  const [customTime, setCustomTime] = useState(
    editing?.outside_normal_window ? editing.serving_time : "",
  );
  const [useCustomTime, setUseCustomTime] = useState(!!editing?.outside_normal_window);
  const [breakfastType, setBreakfastType] = useState<BreakfastType>(editing?.breakfast_type ?? "maldivian");
  const [eggStyle, setEggStyle] = useState<EggStyle>(
    editing?.egg_style ?? (editing?.breakfast_type === "continental" ? "fried" : "omelette"),
  );
  const [potato, setPotato] = useState(editing?.potato ?? false);
  const [juice, setJuice] = useState(editing?.juice ?? false);
  const [tea, setTea] = useState(editing?.tea ?? false);
  const [coffee, setCoffee] = useState(editing?.coffee ?? false);
  const [milk, setMilk] = useState(editing?.milk ?? false);
  const [sugar, setSugar] = useState(editing?.sugar ?? false);
  const [special, setSpecial] = useState(editing?.special_requests ?? "");
  const [status, setStatus] = useState(editing?.status ?? "pending");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEggStyle(breakfastType === "continental" ? "fried" : "omelette");
      if (breakfastType === "continental") setPotato(false);
    }
  }, [breakfastType, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const time = useCustomTime ? customTime : servingTime;
      const payload = {
        breakfast_date: date,
        room_id: room.id,
        guest_number: Number(guestNumber),
        serving_time: time,
        breakfast_type: breakfastType,
        egg_style: eggStyle,
        potato: breakfastType === "maldivian" ? potato : false,
        juice,
        tea,
        coffee,
        milk,
        sugar,
        special_requests: special.trim() || null,
        status,
      };
      if (editing) {
        const res = await apiFetch<BreakfastOrderDto & { shopping?: ShoppingSummaryDto }>(
          `/api/kitchen/orders/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        onDone(res.shopping);
      } else {
        const res = await apiFetch<BreakfastOrderDto & { shopping?: ShoppingSummaryDto }>(
          "/api/kitchen/orders",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        onDone(res.shopping);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch(`/api/kitchen/orders/${editing.id}`, { method: "DELETE" });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const timeOpts: DropdownOption[] = servingTimes.map((t) => ({ value: t, label: t }));

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">Room {room.number}</p>
      <Dropdown
        label="Guest number"
        value={guestNumber}
        onChange={setGuestNumber}
        options={availableGuests.map((g) => ({ value: String(g), label: String(g) }))}
      />
      <Dropdown
        label="Breakfast type"
        value={breakfastType}
        onChange={(v) => setBreakfastType(v as BreakfastType)}
        options={[
          { value: "maldivian", label: "Maldivian" },
          { value: "continental", label: "Continental" },
        ]}
      />

      <div className="rounded-[var(--radius)] border border-border bg-neutral-bg px-4 py-3 text-sm text-ink">
        {breakfastType === "maldivian" ? (
          <>
            <p className="font-semibold">Maldivian stock</p>
            <p className="text-caption">
              Ingredients come from the Maldivian recipe (Kitchen → Recipes). Add or remove items there.
            </p>
            <label className="mt-2 flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={potato} onChange={(e) => setPotato(e.target.checked)} />
              Stir-fried potato (optional extra)
            </label>
          </>
        ) : (
          <>
            <p className="font-semibold">Continental stock</p>
            <p className="text-caption">
              Ingredients come from the Continental recipe (Kitchen → Recipes). Add or remove items there.
            </p>
          </>
        )}
        <Link to="/kitchen/recipes" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-action underline">
          Edit breakfast recipes
        </Link>
      </div>

      <Dropdown label="Egg style" value={eggStyle} onChange={(v) => setEggStyle(v as EggStyle)} options={eggOpts} />

      <fieldset className="space-y-1">
        <legend className="text-label">Beverages</legend>
        {(
          [
            ["juice", juice, setJuice],
            ["tea", tea, setTea],
            ["coffee", coffee, setCoffee],
            ["milk", milk, setMilk],
            ["sugar", sugar, setSugar],
          ] as const
        ).map(([label, val, set]) => (
          <label key={label} className="flex min-h-11 items-center gap-2 text-sm capitalize text-ink">
            <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={useCustomTime} onChange={(e) => setUseCustomTime(e.target.checked)} />
        Special time outside 7:00–9:30 (departing guests)
      </label>
      {useCustomTime ? (
        <TextField
          label="Serving time (HH:mm)"
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          placeholder="06:30"
          required
        />
      ) : (
        <Dropdown label="Serving time" value={servingTime} onChange={setServingTime} options={timeOpts} />
      )}

      <TextField label="Special requests" value={special} onChange={(e) => setSpecial(e.target.value)} />
      <Dropdown
        label="Status"
        value={status}
        onChange={(v) => setStatus(v as typeof status)}
        options={[
          { value: "pending", label: "Pending" },
          { value: "served", label: "Served" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {editing ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void remove()}>
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function defaultQty(opt: RoomExtraOptionDto) {
  const n = Number(opt.qty_per_serving);
  return n > 0 ? n : 1;
}

function isPancakeOption(opt: { code?: string | null; name?: string }) {
  const code = (opt.code ?? "").toLowerCase();
  if (code === "pancake" || code === "pancake_batch" || code === "pancakes") return true;
  return (opt.name ?? "").toLowerCase().includes("pancake");
}

function initialSelectedLines(
  room: KitchenDayRoomDto,
  options: RoomExtraOptionDto[],
): RoomExtraSelectionDto[] {
  if ((room.extras.selected_lines ?? []).length) {
    return room.extras.selected_lines.map((l) => {
      const opt = options.find((o) => o.stock_item_id === l.stock_item_id);
      return {
        ...l,
        name: l.name ?? opt?.name,
        unit: l.unit ?? opt?.unit,
        code: l.code ?? opt?.code ?? null,
        show_on_kot: l.show_on_kot ?? opt?.show_on_kot,
        quantity: l.quantity > 0 ? l.quantity : opt ? defaultQty(opt) : 1,
      };
    });
  }
  const byCode = new Map(options.filter((o) => o.code).map((o) => [o.code!, o]));
  const lines: RoomExtraSelectionDto[] = [];
  const push = (code: string) => {
    const opt = byCode.get(code);
    if (!opt) return;
    lines.push({
      stock_item_id: opt.stock_item_id,
      quantity: defaultQty(opt),
      name: opt.name,
      unit: opt.unit,
      code: opt.code,
      show_on_kot: opt.show_on_kot,
    });
  };
  if (room.extras.honey) push("honey");
  if (room.extras.nutella) push("nutella");
  if (room.extras.cereal) push("cornflakes");
  if (room.extras.water_bottle) push("water_bottle");
  if (room.extras.pancake) {
    for (const code of ["pancake_batch", "pancake", "pancakes"]) {
      if (byCode.has(code)) {
        push(code);
        break;
      }
    }
  }
  return lines;
}

function ExtrasForm({
  date,
  room,
  options,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  options: RoomExtraOptionDto[];
  onDone: (shopping?: ShoppingSummaryDto) => void;
  onError: (s: string) => void;
}) {
  const [fruits, setFruits] = useState<string[]>(room.extras.fruits);
  const [lines, setLines] = useState<RoomExtraSelectionDto[]>(() => initialSelectedLines(room, options));
  const [saving, setSaving] = useState(false);
  const available = options.filter((o) => !lines.some((l) => l.stock_item_id === o.stock_item_id));

  function toggleFruit(id: string) {
    setFruits((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  /** Add with recipe default qty (usually 1); count stays editable on the list. */
  function addWithDefault(opt: RoomExtraOptionDto) {
    const qty = defaultQty(opt);
    setLines((prev) => {
      if (prev.some((l) => l.stock_item_id === opt.stock_item_id)) {
        return prev.map((l) => (l.stock_item_id === opt.stock_item_id ? { ...l, quantity: qty } : l));
      }
      return [
        ...prev,
        {
          stock_item_id: opt.stock_item_id,
          quantity: qty,
          name: opt.name,
          unit: opt.unit,
          code: opt.code,
          show_on_kot: opt.show_on_kot,
        },
      ];
    });
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.stock_item_id !== id));
  }

  function updateQty(id: string, qtyStr: string) {
    setLines((prev) =>
      prev.map((l) => (l.stock_item_id === id ? { ...l, quantity: Number(qtyStr) || 0 } : l)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (fruits.length > 0 && (fruits.length < 2 || fruits.length > 3)) {
      onError("Select 2–3 fruit types, or none");
      return;
    }
    if (lines.some((l) => !(l.quantity > 0))) {
      onError("Each extra needs a quantity greater than 0");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ shopping?: ShoppingSummaryDto }>("/api/kitchen/extras", {
        method: "PUT",
        body: JSON.stringify({
          date,
          room_id: room.id,
          fruits,
          selected_lines: lines.map((l) => ({
            stock_item_id: l.stock_item_id,
            quantity: l.quantity,
          })),
        }),
      });
      onDone(res.shopping);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">Every room may take 2–3 fruit types.</p>
      <div className="grid grid-cols-2 gap-1">
        {fruitOpts.map((f) => (
          <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={fruits.includes(f.id)} onChange={() => toggleFruit(f.id)} />
            {f.label}
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-label">Added extras</p>
        <p className="text-caption">
          Qty starts from the recipe default (e.g. 1 batch). Edit the count, then Save.
        </p>
        {lines.length ? (
          lines.map((line) => (
            <div
              key={line.stock_item_id}
              className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{line.name ?? "Extra"}</p>
                <p className="text-caption">
                  {line.unit ?? ""}
                  {line.show_on_kot ? " · on KOT" : " · stock only"}
                  {isPancakeOption(line) ? " · each = 20 pieces on KOT" : ""}
                </p>
              </div>
              <div className="w-28">
                <TextField
                  label="Count"
                  type="number"
                  step="any"
                  min={0}
                  value={String(line.quantity)}
                  onChange={(e) => updateQty(line.stock_item_id, e.target.value)}
                />
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                aria-label={`Remove ${line.name ?? "extra"}`}
                onClick={() => removeLine(line.stock_item_id)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </button>
            </div>
          ))
        ) : (
          <p className="text-caption">No extras added yet. Tap Add on an item below.</p>
        )}
      </div>

      {options.length ? (
        <div className="space-y-2">
          <p className="text-label">Add from recipe</p>
          {available.length ? (
            available.map((opt) => (
              <div
                key={opt.stock_item_id}
                className="flex flex-wrap items-center gap-2 border-t border-border py-2 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{opt.name}</p>
                  <p className="text-caption">
                    Default {defaultQty(opt)} {opt.unit}
                    {opt.show_on_kot ? " · on KOT" : ""}
                    {isPancakeOption(opt) ? " · 20 pcs / batch" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => addWithDefault(opt)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add {defaultQty(opt)}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-caption">All configured extras are already on the list.</p>
          )}
          <p className="text-caption">
            Defaults come from{" "}
            <Link to="/kitchen/recipes" className="font-semibold text-action underline">
              Recipes → Room extras · Qty when selected
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="text-caption">
          No extras configured.{" "}
          <Link to="/kitchen/recipes" className="font-semibold text-action underline">
            Add items under Recipes → Room extras
          </Link>
        </p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save extras"}
      </Button>
    </form>
  );
}
