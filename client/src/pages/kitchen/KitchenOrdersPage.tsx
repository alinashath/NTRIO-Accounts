import { Apple, Pencil, Plus, Users } from "lucide-react";
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

function IconBtn({
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
          ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm bg-action text-white disabled:opacity-50"
          : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border bg-surface text-ink hover:bg-neutral-bg disabled:opacity-50"
      }
    >
      {children}
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Breakfast orders</h1>
          <p className="mt-1 text-caption">
            Pick a date · rooms &amp; stays in Occupancy · saving updates stock Used and shopping list.
          </p>
        </div>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            <IconBtn label="Set occupants for this date" onClick={() => setOccRoom(room)}>
              <Users className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </IconBtn>
            <IconBtn label="Fruits and extras" onClick={() => setExtrasRoom(room)}>
              <Apple className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </IconBtn>
            <IconBtn
              label="Add breakfast"
              tone="action"
              disabled={room.orders.filter((o) => o.status !== "cancelled").length >= 3}
              onClick={() => setOrderModal({ room })}
            >
              <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </IconBtn>
          </div>

          {room.orders.length === 0 ? (
            <p className="border-t border-border px-4 py-3 text-caption">
              No breakfast orders. Occupied rooms are not assumed to need breakfast.
            </p>
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

          {(room.extras.fruits.length > 0 ||
            room.extras.pancake ||
            room.extras.honey ||
            room.extras.nutella ||
            room.extras.cereal ||
            room.extras.water_bottle) && (
            <p className="border-t border-border px-4 py-3 text-caption">
              Extras:{" "}
              {[
                ...room.extras.fruits,
                room.extras.pancake ? "pancake" : null,
                room.extras.honey ? "honey" : null,
                room.extras.nutella ? "nutella" : null,
                room.extras.cereal ? "cereal" : null,
                room.extras.water_bottle ? "1.5L water" : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
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
            <p className="font-semibold">Maldivian includes</p>
            <p className="text-caption">5 Roshi · 1 Mashuni · Egg (default omelette)</p>
            <label className="mt-2 flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={potato} onChange={(e) => setPotato(e.target.checked)} />
              Stir-fried potato (optional)
            </label>
          </>
        ) : (
          <>
            <p className="font-semibold">Continental includes</p>
            <p className="text-caption">3 bread · 2 sausages · 2 butter · 1 jam · Egg (default fried)</p>
          </>
        )}
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

function ExtrasForm({
  date,
  room,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  onDone: (shopping?: ShoppingSummaryDto) => void;
  onError: (s: string) => void;
}) {
  const [fruits, setFruits] = useState<string[]>(room.extras.fruits);
  const [pancake, setPancake] = useState(room.extras.pancake);
  const [honey, setHoney] = useState(room.extras.honey);
  const [nutella, setNutella] = useState(room.extras.nutella);
  const [cereal, setCereal] = useState(room.extras.cereal);
  const [water, setWater] = useState(room.extras.water_bottle);
  const [saving, setSaving] = useState(false);

  function toggleFruit(id: string) {
    setFruits((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (fruits.length > 0 && (fruits.length < 2 || fruits.length > 3)) {
      onError("Select 2–3 fruit types, or none");
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
          pancake,
          honey,
          nutella,
          cereal,
          water_bottle: water,
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
      <fieldset className="space-y-1">
        <legend className="text-label">Extras</legend>
        {(
          [
            ["Pancake", pancake, setPancake],
            ["Honey", honey, setHoney],
            ["Nutella", nutella, setNutella],
            ["Cereal", cereal, setCereal],
            ["1.5 L water bottle", water, setWater],
          ] as const
        ).map(([label, val, set]) => (
          <label key={label} className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save extras"}
      </Button>
    </form>
  );
}
