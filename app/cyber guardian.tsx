"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

type Screen = "home" | "create" | "join" | "how" | "room";
type Mode = "race" | "team";

type GameState = {
  positions: Record<string, number>;
  scores: Record<string, number>;
  turn_order: string[];
  current_turn_index: number;
  started: boolean;
  last_roll?: number | null;
  winner_id?: string | null;
};

type GameRoom = {
  id: string;
  room_code: string;
  host_id: string;
  status: "waiting" | "playing" | "finished";
  max_players: number;
  mode: Mode;
  created_at: string;
  game_state: GameState;
};

type GamePlayer = {
  id: string;
  room_id: string;
  user_id: string;
  player_name: string;
  joined_at: string;
};

export default function Home() {
  const [supabase] = useState(() => createClient());

  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("race");

  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [userId, setUserId] = useState("");

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // เข้าสู่ระบบผู้เล่นชั่วคราว
  async function ensureSignedIn(): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession();

    if (sessionData.session?.user) {
      const id = sessionData.session.user.id;
      setUserId(id);
      return id;
    }

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      throw new Error(
        "เข้าสู่ระบบผู้เล่นไม่สำเร็จ: " + error.message
      );
    }

    if (!data.user) {
      throw new Error("ไม่พบข้อมูลผู้เล่น กรุณาลองอีกครั้ง");
    }

    setUserId(data.user.id);
    return data.user.id;
  }

  // สร้างห้องเกมออนไลน์
  async function createRoom() {
    const name = playerName.trim();

    if (!name) {
      setMessage("กรุณากรอกชื่อผู้เล่นก่อนสร้างห้อง");
      return;
    }

    setBusy(true);
    setMessage("");

    let newRoom: GameRoom | null = null;

    try {
      const hostId = await ensureSignedIn();

      // สร้างรหัสห้อง หากรหัสซ้ำจะลองใหม่
      for (let attempt = 0; attempt < 5; attempt++) {
        const code =
          "CG" + Math.floor(1000 + Math.random() * 9000);

        const { data, error } = await supabase
          .from("game_rooms")
          .insert({
            room_code: code,
            host_id: hostId,
            status: "waiting",
            max_players: 4,
            mode,
          })
          .select("*")
          .single();

        if (!error && data) {
          newRoom = data as GameRoom;
          break;
        }

        if (error?.code !== "23505") {
          throw new Error(
            "สร้างห้องไม่สำเร็จ: " +
              (error?.message ?? "เกิดข้อผิดพลาด")
          );
        }
      }

      if (!newRoom) {
        throw new Error(
          "สร้างรหัสห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
        );
      }

      // เพิ่มเจ้าของห้องเป็นผู้เล่นคนแรก
      const { data: hostPlayer, error: playerError } =
        await supabase
          .from("game_players")
          .insert({
            room_id: newRoom.id,
            user_id: hostId,
            player_name: name,
          })
          .select("*")
          .single();

      if (playerError) {
        await supabase
          .from("game_rooms")
          .delete()
          .eq("id", newRoom.id);

        throw new Error(
          "สร้างห้องได้ แต่เพิ่มผู้เล่นไม่สำเร็จ: " +
            playerError.message
        );
      }

      setRoom(newRoom);
      setPlayers(
        hostPlayer ? [hostPlayer as GamePlayer] : []
      );
      setScreen("room");
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการสร้างห้อง"
      );
    } finally {
      setBusy(false);
    }
  }

  // เข้าร่วมห้องด้วยรหัส
  async function joinRoom() {
    const name = playerName.trim();
    const code = roomCode.trim().toUpperCase();

    if (!name) {
      setMessage("กรุณากรอกชื่อผู้เล่นก่อนเข้าร่วมห้อง");
      return;
    }

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setMessage(
        "รหัสห้องต้องมี 6 ตัวอักษร เช่น CG4821"
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const currentUserId = await ensureSignedIn();

      // ค้นหาห้องจากฐานข้อมูล
      const { data: foundRoom, error: roomError } =
        await supabase
          .from("game_rooms")
          .select("*")
          .eq("room_code", code)
          .maybeSingle();

      if (roomError) {
        throw new Error(
          "ค้นหาห้องไม่สำเร็จ: " + roomError.message
        );
      }

      if (!foundRoom) {
        throw new Error(
          "ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้องอีกครั้ง"
        );
      }

      const existingRoom = foundRoom as GameRoom;

      if (existingRoom.status !== "waiting") {
        throw new Error("ห้องนี้ไม่ได้อยู่ในสถานะรอผู้เล่น");
      }

      // ตรวจสอบรายชื่อผู้เล่น
      const { data: currentPlayers, error: listError } =
        await supabase
          .from("game_players")
          .select("id, user_id")
          .eq("room_id", existingRoom.id);

      if (listError) {
        throw new Error(
          "โหลดข้อมูลผู้เล่นไม่สำเร็จ: " +
            listError.message
        );
      }

      const playerList = currentPlayers ?? [];

      // ตรวจสอบว่าผู้เล่นเข้าห้องนี้อยู่แล้วหรือไม่
      const alreadyJoined = playerList.some(
        (player: { user_id: string }) =>
          player.user_id === currentUserId
      );

      if (alreadyJoined) {
        setRoom(existingRoom);
        setScreen("room");
        setMessage("");
        return;
      }

      if (playerList.length >= existingRoom.max_players) {
        throw new Error("ห้องนี้เต็มแล้ว");
      }

      // เพิ่มผู้เล่นใหม่ลงในฐานข้อมูล
      const { error: joinError } = await supabase
        .from("game_players")
        .insert({
          room_id: existingRoom.id,
          user_id: currentUserId,
          player_name: name,
        });

      if (joinError) {
        throw new Error(
          "เข้าร่วมห้องไม่สำเร็จ: " + joinError.message
        );
      }

      setRoom(existingRoom);
      setScreen("room");
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการเข้าร่วมห้อง"
      );
    } finally {
      setBusy(false);
    }
  }

  // โหลดรายชื่อผู้เล่นและตรวจสอบห้องออนไลน์
useEffect(() => {
  const currentRoom = room;

  // ถ้ายังไม่มีห้อง ไม่ต้องทำงาน
  if (!currentRoom?.id) return;

  // เก็บรหัสห้องไว้เพื่อใช้ใน effect นี้
  const roomId = currentRoom.id;

  let active = true;

  // โหลดรายชื่อผู้เล่นล่าสุดจากฐานข้อมูล
  async function loadPlayers() {
    const { data, error } = await supabase
      .from("game_players")
      .select("*")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

    if (!active) return;

    if (error) {
      console.error(
        "โหลดรายชื่อผู้เล่นไม่สำเร็จ:",
        error.message
      );

      setMessage(
        "โหลดรายชื่อผู้เล่นไม่สำเร็จ: " + error.message
      );

      return;
    }

    setPlayers((data ?? []) as GamePlayer[]);
  }

  // ตรวจสอบว่าห้องยังอยู่ในฐานข้อมูลหรือไม่
  async function checkRoom() {
    const { data, error } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    if (!active) return;

    if (error) {
      console.error(
        "ตรวจสอบห้องไม่สำเร็จ:",
        error.message
      );

      setMessage(
        "ตรวจสอบห้องไม่สำเร็จ: " + error.message
      );

      return;
    }

    // ถ้าไม่พบห้อง ให้กลับหน้าหลัก
    if (!data) {
      setRoom(null);
      setPlayers([]);
      setScreen("home");
      setMessage("ห้องนี้ถูกปิดแล้ว");
      return;
    }

    setRoom(data as GameRoom);
  }

  // โหลดข้อมูลทันทีเมื่อเข้าห้อง
  void loadPlayers();
  void checkRoom();

  // ติดตามการเปลี่ยนแปลงของรายชื่อผู้เล่น
  const channel = supabase
    .channel("game-room-" + roomId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_players",
        filter: "room_id=eq." + roomId,
      },
      () => {
        void loadPlayers();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_rooms",
        filter: "id=eq." + roomId,
      },
      () => {
        void checkRoom();
        void loadPlayers();
      }
    )
    .subscribe((status) => {
      console.log("สถานะ Realtime:", status);
    });

  // ตรวจสอบข้อมูลซ้ำทุก 3 วินาที
  const timer = window.setInterval(() => {
    void loadPlayers();
    void checkRoom();
  }, 3000);

  // หยุดระบบเมื่อออกจากห้องหรือเปลี่ยนห้อง
  return () => {
    active = false;

    window.clearInterval(timer);

    void supabase.removeChannel(channel);
  };
}, [room?.id, supabase]);
  // เริ่มเกม
  async function startGame() {
    if (!room) return;

    if (room.host_id !== userId) {
      setMessage("เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      // โหลดรายชื่อผู้เล่นล่าสุด
      const { data: playerData, error: playerError } =
        await supabase
          .from("game_players")
          .select("*")
          .eq("room_id", room.id)
          .order("joined_at", { ascending: true });

      if (playerError) {
        throw new Error(
          "โหลดผู้เล่นไม่สำเร็จ: " + playerError.message
        );
      }

      const allPlayers = (playerData ?? []) as GamePlayer[];

      if (allPlayers.length < 2) {
        throw new Error(
          "ต้องมีผู้เล่นอย่างน้อย 2 คนจึงจะเริ่มเกมได้"
        );
      }

      if (allPlayers.length > room.max_players) {
        throw new Error("จำนวนผู้เล่นเกินที่ห้องกำหนด");
      }

      const turnOrder = allPlayers.map(
        (player) => player.user_id
      );

      const positions: Record<string, number> = {};
      const scores: Record<string, number> = {};

      for (const player of allPlayers) {
        positions[player.user_id] = 0;
        scores[player.user_id] = 0;
      }

      const initialState: GameState = {
        positions,
        scores,
        turn_order: turnOrder,
        current_turn_index: 0,
        started: true,
        last_roll: null,
        winner_id: null,
      };

      // บันทึกสถานะเกมลง Supabase
      const { data, error } = await supabase
        .from("game_rooms")
        .update({
          status: "playing",
          game_state: initialState,
        })
        .eq("id", room.id)
        .eq("host_id", userId)
        .select("*")
        .single();

      if (error) {
        throw new Error(
          "เริ่มเกมไม่สำเร็จ: " + error.message
        );
      }

      setPlayers(allPlayers);
      setRoom(data as GameRoom);
      setMessage("เริ่มเกมแล้ว! เตรียมตัวทอยลูกเต๋า");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการเริ่มเกม"
      );
    } finally {
      setBusy(false);
    }
  }

  // ทอยลูกเต๋าและเดินตัวละคร
  async function rollDice() {
    if (!room) return;

    setBusy(true);
    setMessage("");

    try {
      // อ่านสถานะล่าสุดจากฐานข้อมูลก่อนทอย
      const { data: latestData, error: readError } =
        await supabase
          .from("game_rooms")
          .select("*")
          .eq("id", room.id)
          .maybeSingle();

      if (readError) {
        throw new Error(
          "โหลดสถานะเกมไม่สำเร็จ: " + readError.message
        );
      }

      if (!latestData) {
        setRoom(null);
        setPlayers([]);
        setScreen("home");
        setMessage("ห้องนี้ถูกปิดแล้ว");
        return;
      }

      const latestRoom = latestData as GameRoom;
      const gameState = latestRoom.game_state;

      if (
        latestRoom.status !== "playing" ||
        !gameState?.started
      ) {
        throw new Error("เกมยังไม่เริ่มหรือจบไปแล้ว");
      }

      const turnOrder = gameState.turn_order;

      if (!turnOrder || turnOrder.length === 0) {
        throw new Error("ไม่พบลำดับผู้เล่น กรุณาเริ่มเกมใหม่");
      }

      const currentIndex =
        gameState.current_turn_index;

      const currentPlayerId = turnOrder[currentIndex];

      if (currentPlayerId !== userId) {
        const currentPlayer = players.find(
          (player) => player.user_id === currentPlayerId
        );

        throw new Error(
          "ยังไม่ถึงตาของคุณ" +
            (currentPlayer
              ? " ถึงตา " + currentPlayer.player_name
              : "")
        );
      }

      // สุ่มแต้มลูกเต๋า 1–6
      const dice = Math.floor(Math.random() * 6) + 1;

      const oldPosition =
        gameState.positions[userId] ?? 0;

      // กระดานมี 30 ช่อง
      const newPosition = Math.min(
        30,
        oldPosition + dice
      );

      const positions = {
        ...gameState.positions,
        [userId]: newPosition,
      };

      const hasWon = newPosition >= 30;

      const nextIndex = hasWon
        ? currentIndex
        : (currentIndex + 1) % turnOrder.length;

      const nextState: GameState = {
        ...gameState,
        positions,
        last_roll: dice,
        current_turn_index: nextIndex,
        winner_id: hasWon ? userId : null,
      };

      // บันทึกผลลูกเต๋าและตำแหน่งลงฐานข้อมูล
      const { data: updatedData, error: updateError } =
        await supabase
          .from("game_rooms")
          .update({
            game_state: nextState,
            status: hasWon ? "finished" : "playing",
          })
          .eq("id", latestRoom.id)
          .eq("status", "playing")
          .select("*")
          .single();

      if (updateError) {
        throw new Error(
          "บันทึกการเดินไม่สำเร็จ: " +
            updateError.message
        );
      }

      setRoom(updatedData as GameRoom);

      if (hasWon) {
        const winner = players.find(
          (player) => player.user_id === userId
        );

        setMessage(
          "🏆 " +
            (winner?.player_name ?? "ผู้เล่น") +
            " เดินถึงเส้นชัยและชนะเกมแล้ว!"
        );
      } else {
        setMessage(
          "🎲 คุณทอยได้ " +
            dice +
            " แต้ม และเดินไปช่องที่ " +
            newPosition
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการทอยลูกเต๋า"
      );
    } finally {
      setBusy(false);
    }
  }
  // ออกจากห้อง
  async function leaveRoom() {
    if (!room || !userId) {
      setRoom(null);
      setPlayers([]);
      setScreen("home");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (room.host_id === userId) {
        // เจ้าของห้องออก จะลบห้อง
        const { error } = await supabase
          .from("game_rooms")
          .delete()
          .eq("id", room.id);

        if (error) {
          throw new Error(
            "ปิดห้องไม่สำเร็จ: " + error.message
          );
        }
      } else {
        // ผู้เล่นทั่วไปลบเฉพาะรายชื่อของตนเอง
        const { error } = await supabase
          .from("game_players")
          .delete()
          .eq("room_id", room.id)
          .eq("user_id", userId);

        if (error) {
          throw new Error(
            "ออกจากห้องไม่สำเร็จ: " + error.message
          );
        }
      }

      setRoom(null);
      setPlayers([]);
      setScreen("home");
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการออกจากห้อง"
      );
    } finally {
      setBusy(false);
    }
  }

  // คัดลอกรหัสห้อง
  async function copyRoomCode() {
    if (!room) return;

    try {
      await navigator.clipboard.writeText(room.room_code);
      setMessage(
        "คัดลอกรหัสห้องแล้ว สามารถส่งให้เพื่อนได้"
      );
    } catch {
      setMessage(
        "ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาจดรหัสห้องไว้"
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#09090c] text-white">
      {/* ส่วนหัวเว็บไซต์ */}
      <header className="border-b border-red-900 bg-black px-5 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button
            onClick={() => {
              if (!room) {
                setScreen("home");
                setMessage("");
              }
            }}
            className="flex items-center gap-3 text-left"
          >
            <span className="text-4xl">🛡️</span>

            <span>
              <span className="block text-lg font-black">
                CYBER <span className="text-red-500">GUARDIAN</span>
              </span>

              <span className="text-xs text-gray-400">
                ภารกิจพิชิตภัยไซเบอร์
              </span>
            </span>
          </button>

          <span className="hidden rounded-full border border-red-800 px-3 py-2 text-xs text-red-300 sm:block">
            ONLINE BOARD GAME
          </span>
        </div>
      </header>

      {/* หน้าหลัก */}
      {screen === "home" && (
        <>
          {message && (
            <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-200">
              {message}
            </div>
          )}

          <section className="relative overflow-hidden bg-gradient-to-br from-red-950 via-black to-black">
            <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
              <div>
                <span className="rounded-full border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-300">
                  🎮 CYBER SECURITY ADVENTURE
                </span>

                <h1 className="mt-8 text-4xl font-black leading-tight sm:text-6xl">
                  ภารกิจพิชิต
                  <span className="block text-red-500">
                    ภัยไซเบอร์
                  </span>
                </h1>

                <h2 className="mt-4 text-2xl font-black tracking-widest">
                  CYBER GUARDIAN
                </h2>

                <p className="mt-5 max-w-xl leading-8 text-gray-300">
                  ก้าวเข้าสู่โลกแห่งความปลอดภัยทางไซเบอร์
                  ทอยลูกเต๋า ทำภารกิจ วิเคราะห์สถานการณ์
                  และฝึกป้องกันภัยในโลกดิจิทัล
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setScreen("create");
                      setMessage("");
                    }}
                    className="rounded-xl bg-red-600 px-6 py-4 font-bold hover:bg-red-500"
                  >
                    ⚔️ สร้างห้องเกม
                  </button>

                  <button
                    onClick={() => {
                      setScreen("join");
                      setMessage("");
                    }}
                    className="rounded-xl border border-red-700 px-6 py-4 font-bold hover:bg-red-950"
                  >
                    🚪 เข้าร่วมห้อง
                  </button>
                </div>

                <button
                  onClick={() => {
                    setScreen("how");
                    setMessage("");
                  }}
                  className="mt-5 text-sm text-gray-400 underline underline-offset-4 hover:text-white"
                >
                  อ่านวิธีเล่น →
                </button>
              </div>

              <div className="rounded-3xl border border-red-800 bg-gradient-to-br from-red-950 to-black p-6 shadow-2xl shadow-red-950">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-red-400">
                    CYBER MISSIONS
                  </span>
                  <span>🔐</span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["🔐", "ตัวตนดิจิทัล"],
                    ["🎣", "ฟิชชิง"],
                    ["🦠", "มัลแวร์"],
                    ["🕵️", "ความเป็นส่วนตัว"],
                    ["🎲", "กระดานเกม"],
                    ["🏆", "ภารกิจสุดท้าย"],
                  ].map(([icon, label]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-red-900 bg-black p-4 text-center"
                    >
                      <div className="text-3xl">{icon}</div>
                      <div className="mt-3 text-sm font-bold">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-red-900 bg-black p-4">
                  <p className="text-sm font-bold text-red-400">
                    YOUR MISSION
                  </p>

                  <p className="mt-2 text-sm text-gray-300">
                    เรียนรู้ • คิดวิเคราะห์ • ป้องกันภัย
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-5 py-12">
            <h2 className="text-center text-2xl font-black">
              เลือกเส้นทางภารกิจ
            </h2>

            <p className="mt-3 text-center text-gray-400">
              ฝึกคิด วิเคราะห์ และเรียนรู้ผ่านสถานการณ์จำลอง
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["01", "🔐", "Digital Identity"],
                ["02", "🎣", "Phishing Attack"],
                ["03", "🦠", "Malware Defense"],
                ["04", "🕵️", "Privacy Protection"],
                ["05", "🏆", "Cyber Mission"],
              ].map(([number, icon, title]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-gray-800 bg-[#141418] p-5 hover:border-red-700"
                >
                  <p className="text-xs font-bold text-red-500">
                    MISSION {number}
                  </p>

                  <p className="mt-4 text-3xl">{icon}</p>
                  <h3 className="mt-4 font-bold">{title}</h3>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* หน้าสร้างห้อง */}
      {screen === "create" && (
        <section className="mx-auto max-w-xl px-5 py-12">
          <button
            onClick={() => {
              setScreen("home");
              setMessage("");
            }}
            className="mb-6 text-red-400"
          >
            ← กลับหน้าหลัก
          </button>

          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <h1 className="text-3xl font-black">สร้างห้องเกม</h1>

            <p className="mt-2 text-sm text-gray-400">
              สร้างห้องออนไลน์แล้วส่งรหัสให้เพื่อน
            </p>

            <label className="mt-6 block text-sm font-bold">
              ชื่อผู้เล่น
            </label>

            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="กรอกชื่อเล่นของคุณ"
              maxLength={24}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 outline-none focus:border-red-500"
            />

            <h2 className="mt-6 font-bold">
              เลือกรูปแบบการเล่น
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("race")}
                className={`rounded-xl border p-4 text-left ${
                  mode === "race"
                    ? "border-red-500 bg-red-950"
                    : "border-gray-700"
                }`}
              >
                <span className="text-2xl">🏁</span>

                <span className="mt-2 block font-bold">
                  โหมดแข่งขัน
                </span>

                <span className="mt-1 block text-xs text-gray-400">
                  แข่งขันเพื่อเป็นผู้ชนะ
                </span>
              </button>

              <button
                onClick={() => setMode("team")}
                className={`rounded-xl border p-4 text-left ${
                  mode === "team"
                    ? "border-red-500 bg-red-950"
                    : "border-gray-700"
                }`}
              >
                <span className="text-2xl">🛡️</span>

                <span className="mt-2 block font-bold">
                  โหมดร่วมมือ
                </span>

                <span className="mt-1 block text-xs text-gray-400">
                  ช่วยกันทำภารกิจ
                </span>
              </button>
            </div>

            <button
              onClick={createRoom}
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-red-600 px-5 py-4 font-bold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังสร้างห้อง..." : "⚔️ สร้างห้องออนไลน์"}
            </button>

            {message && (
              <p className="mt-4 break-words rounded-xl border border-yellow-700 p-3 text-sm leading-6 text-yellow-200">
                {message}
              </p>
            )}
          </div>
        </section>
      )}

      {/* หน้าเข้าร่วมห้อง */}
      {screen === "join" && (
        <section className="mx-auto max-w-xl px-5 py-12">
          <button
            onClick={() => {
              setScreen("home");
              setMessage("");
            }}
            className="mb-6 text-red-400"
          >
            ← กลับหน้าหลัก
          </button>

          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <h1 className="text-3xl font-black">เข้าร่วมห้องเกม</h1>

            <p className="mt-2 text-sm text-gray-400">
              ใส่ชื่อของคุณและรหัสจากเจ้าของห้อง
            </p>

            <label className="mt-6 block text-sm font-bold">
              ชื่อผู้เล่น
            </label>

            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="กรอกชื่อเล่นของคุณ"
              maxLength={24}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 outline-none focus:border-red-500"
            />

            <label className="mt-5 block text-sm font-bold">
              รหัสห้องเกม
            </label>

            <input
              value={roomCode}
              onChange={(e) =>
                setRoomCode(e.target.value.toUpperCase())
              }
              placeholder="ตัวอย่าง CG4821"
              maxLength={6}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 uppercase outline-none focus:border-red-500"
            />

            <button
              onClick={joinRoom}
              disabled={busy}
              className="mt-5 w-full rounded-xl bg-red-600 px-5 py-4 font-bold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังเข้าร่วมห้อง..." : "🚪 เข้าร่วมห้องออนไลน์"}
            </button>

            {message && (
              <p className="mt-4 break-words rounded-xl border border-yellow-700 p-3 text-sm leading-6 text-yellow-200">
                {message}
              </p>
            )}
          </div>
        </section>
      )}

      {/* หน้ารอผู้เล่น */}
      {screen === "room" && room && (
        <section className="mx-auto max-w-3xl px-5 py-12">
          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-red-400">
                  CYBER GUARDIAN
                </p>

                <h1 className="mt-2 text-3xl font-black">
                  ห้องรอผู้เล่น
                </h1>

                <p className="mt-2 text-sm text-gray-400">
                  สถานะ:{" "}
                  {room.status === "waiting"
                    ? "รอผู้เล่น"
                    : room.status}
                </p>
              </div>

              <span className="rounded-full border border-green-700 bg-green-950/40 px-3 py-2 text-xs text-green-300">
                ● ห้องออนไลน์
              </span>
            </div>

            <div className="mt-6 rounded-2xl border border-red-800 bg-black p-5 text-center">
              <p className="text-sm text-gray-400">
                รหัสห้องของคุณ
              </p>

              <p className="mt-2 text-4xl font-black tracking-[0.2em] text-red-400">
                {room.room_code}
              </p>

              <button
                onClick={copyRoomCode}
                className="mt-4 rounded-lg border border-red-800 px-4 py-2 text-sm font-bold hover:bg-red-950"
              >
                📋 คัดลอกรหัสห้อง
              </button>

              <p className="mt-3 text-xs text-gray-500">
                ส่งรหัสนี้ให้เพื่อนเพื่อเข้าร่วมห้องเดียวกัน
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-800 bg-black p-4">
                <p className="text-xs text-gray-400">โหมดเกม</p>

                <p className="mt-2 font-bold text-white">
                  {room.mode === "race"
                    ? "🏁 แข่งขัน"
                    : "🛡️ ร่วมมือ"}
                </p>
              </div>
{/* กระดานเกม CYBER GUARDIAN */}
<div className="mt-8 rounded-3xl border border-red-900 bg-gradient-to-br from-red-950/60 to-black p-5 sm:p-7">
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div>
      <p className="text-sm font-bold text-red-400">
        CYBER MISSION
      </p>

      <h2 className="mt-2 text-2xl font-black">
        🎲 กระดานพิชิตภัยไซเบอร์
      </h2>

      <p className="mt-2 text-sm text-gray-400">
        เดินทางจากจุดเริ่มต้นไปยังเส้นชัยช่องที่ 30
      </p>
    </div>

    {room.status === "waiting" &&
      room.host_id === userId && (
        <button
          onClick={startGame}
          disabled={busy || players.length < 2}
          className="rounded-xl bg-red-600 px-5 py-3 font-bold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "กำลังเริ่มเกม..."
            : players.length < 2
              ? "รอผู้เล่นอย่างน้อย 2 คน"
              : "🚀 เริ่มเกม"}
        </button>
      )}

    {room.status === "waiting" &&
      room.host_id !== userId && (
        <span className="rounded-xl border border-yellow-700 px-4 py-3 text-sm text-yellow-300">
          ⏳ รอเจ้าของห้องเริ่มเกม
        </span>
      )}

    {room.status === "playing" && (
      <button
        onClick={rollDice}
        disabled={
          busy ||
          room.game_state?.turn_order?.[
            room.game_state.current_turn_index
          ] !== userId
        }
        className="rounded-xl bg-red-600 px-6 py-4 font-black hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "กำลังทอย..." : "🎲 ทอยลูกเต๋า"}
      </button>
    )}
  </div>

  {room.status === "waiting" && (
    <div className="mt-6 rounded-xl border border-gray-800 bg-black/60 p-4 text-sm text-gray-300">
      ต้องมีผู้เล่นอย่างน้อย 2 คน เจ้าของห้องจึงจะเริ่มเกมได้
    </div>
  )}

  {room.status === "playing" && (
    <div className="mt-6 rounded-2xl border border-red-800 bg-black p-4">
      <p className="text-sm text-gray-400">
        ถึงตาของผู้เล่น
      </p>

      <p className="mt-2 text-xl font-black text-red-400">
        {players.find(
          (player) =>
            player.user_id ===
            room.game_state?.turn_order?.[
              room.game_state.current_turn_index
            ]
        )?.player_name ?? "กำลังโหลดข้อมูลผู้เล่น..."}
      </p>

      {room.game_state?.last_roll != null && (
        <p className="mt-3 text-gray-200">
          🎲 ผลทอยลูกเต๋าครั้งล่าสุด:{" "}
          <span className="font-black text-yellow-300">
            {room.game_state.last_roll}
          </span>
        </p>
      )}
    </div>
  )}

  {room.status === "finished" && (
    <div className="mt-6 rounded-2xl border border-yellow-600 bg-yellow-950/30 p-5 text-center">
      <p className="text-3xl">🏆</p>

      <h3 className="mt-2 text-xl font-black text-yellow-300">
        จบเกมแล้ว!
      </h3>

      <p className="mt-2 text-gray-300">
        ผู้ชนะ:{" "}
        {players.find(
          (player) =>
            player.user_id === room.game_state?.winner_id
        )?.player_name ?? "ผู้เล่น"}
      </p>
    </div>
  )}

  {/* กระดาน 30 ช่อง */}
  <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
    {Array.from({ length: 30 }, (_, index) => {
      const cellNumber = index + 1;

      const cellPlayers = players.filter(
        (player) =>
          (room.game_state?.positions?.[player.user_id] ?? 0) ===
          cellNumber
      );

      return (
        <div
          key={cellNumber}
          className={`flex min-h-24 flex-col rounded-xl border p-2 ${
            cellPlayers.length > 0
              ? "border-red-500 bg-red-950"
              : cellNumber === 30
                ? "border-yellow-600 bg-yellow-950/30"
                : "border-gray-800 bg-[#141418]"
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-gray-400">
              ช่อง {cellNumber}
            </span>

            {cellNumber === 30 && <span>🏆</span>}
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {cellPlayers.map((player) => (
              <span
                key={player.id}
                title={player.player_name}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400 bg-red-600 text-xs font-black text-white"
              >
                {player.player_name.slice(0, 2)}
              </span>
            ))}
          </div>

          {cellNumber === 30 && (
            <span className="mt-auto pt-2 text-xs font-bold text-yellow-300">
              เส้นชัย
            </span>
          )}
        </div>
      );
    })}
  </div>

  {/* จุดเริ่มต้น */}
  <div className="mt-4 rounded-xl border border-green-800 bg-green-950/20 p-4">
    <p className="font-bold text-green-300">
      🟢 จุดเริ่มต้น
    </p>

    <div className="mt-3 flex flex-wrap gap-2">
      {players
        .filter(
          (player) =>
            (room.game_state?.positions?.[player.user_id] ?? 0) === 0
        )
        .map((player) => (
          <span
            key={player.id}
            className="rounded-lg border border-green-800 bg-black px-3 py-2 text-sm"
          >
            🧍 {player.player_name}
          </span>
        ))}
    </div>
  </div>

  {/* คำอธิบาย */}
  <div className="mt-5 rounded-xl border border-gray-800 bg-black/60 p-4">
    <p className="text-sm leading-7 text-gray-300">
      🎲 ผู้เล่นที่ถึงตาจะกดทอยลูกเต๋าเพื่อเดินไปข้างหน้า
      <br />
      🔴 วงกลมสีแดงแสดงตำแหน่งตัวละคร
      <br />
      🏆 ผู้เล่นที่ไปถึงช่องที่ 30 ก่อนจะเป็นผู้ชนะ
    </p>
  </div>
</div>
              <div className="rounded-xl border border-gray-800 bg-black p-4">
                <p className="text-xs text-gray-400">ผู้เล่นในห้อง</p>

                <p className="mt-2 font-bold text-white">
                  {players.length} / {room.max_players} คน
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-xl font-black">
                👥 รายชื่อผู้เล่น
              </h2>

              <div className="mt-4 space-y-3">
                {players.length === 0 ? (
                  <p className="rounded-xl border border-gray-800 p-4 text-sm text-gray-400">
                    กำลังโหลดรายชื่อผู้เล่น...
                  </p>
                ) : (
                  players.map((player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-800 bg-black p-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-900 font-black">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="break-words font-bold">
                          {player.player_name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {player.user_id === room.host_id
                            ? "เจ้าของห้อง"
                            : "ผู้เล่น"}
                        </p>
                      </div>

                      {player.user_id === room.host_id && (
                        <span className="text-xl">👑</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-red-950 bg-black/60 p-4">
              <p className="text-sm leading-6 text-gray-300">
                ระบบจะอัปเดตรายชื่อผู้เล่นเมื่อมีผู้เข้าร่วมหรือออกจากห้อง
                โดยไม่จำเป็นต้องรีเฟรชหน้าเว็บ หากการเชื่อมต่อ Realtime
                ทำงานตามปกติ
              </p>
            </div>

            {message && (
              <p className="mt-4 break-words rounded-xl border border-yellow-700 p-3 text-sm leading-6 text-yellow-200">
                {message}
              </p>
            )}

            <button
              onClick={leaveRoom}
              disabled={busy}
              className="mt-6 w-full rounded-xl border border-red-700 px-5 py-4 font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"
            >
              {busy
                ? "กำลังดำเนินการ..."
                : room.host_id === userId
                  ? "ปิดห้องและกลับหน้าหลัก"
                  : "ออกจากห้อง"}
            </button>
          </div>
        </section>
      )}

      {/* หน้าวิธีเล่น */}
      {screen === "how" && (
        <section className="mx-auto max-w-2xl px-5 py-12">
          <button
            onClick={() => {
              setScreen("home");
              setMessage("");
            }}
            className="mb-6 text-red-400"
          >
            ← กลับหน้าหลัก
          </button>

          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <h1 className="text-3xl font-black">
              วิธีเล่น CYBER GUARDIAN
            </h1>

            <div className="mt-6 space-y-3">
              {[
                "สร้างห้องและเลือกโหมดการเล่น",
                "ส่งรหัสห้องให้ผู้เล่นคนอื่น",
                "ให้ผู้เล่นกรอกรหัสเพื่อเข้าร่วมห้อง",
                "ทอยลูกเต๋าเพื่อเดินบนกระดาน",
                "ตอบคำถามหรือทำภารกิจไซเบอร์",
                "รับคะแนนและเรียนรู้จากคำเฉลย",
                "ผ่านด่านสุดท้ายเพื่อจบเกม",
              ].map((item, i) => (
                <div
                  key={item}
                  className="flex items-center gap-4 rounded-xl border border-gray-800 p-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-700 font-black">
                    {i + 1}
                  </span>

                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ส่วนท้ายเว็บไซต์ */}
      <footer className="border-t border-gray-800 px-5 py-8 text-center">
        <p className="font-black tracking-widest">
          CYBER <span className="text-red-500">GUARDIAN</span>
        </p>

        <p className="mt-2 text-xs text-gray-500">
          เรียนรู้ • คิดวิเคราะห์ • ป้องกันภัยในโลกดิจิทัล
        </p>
      </footer>
    </main>
  );
}