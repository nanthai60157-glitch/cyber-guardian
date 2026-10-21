"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

type Screen = "home" | "create" | "join" | "how" | "room" | "lessons";
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

// 🦊 ไอคอนการ์ตูนสำหรับตัวเดินของผู้เล่น
const PLAYER_AVATARS = ["🦊", "🐼", "🐯", "🐶", "🐱", "🐰", "🐻", "🐨"];

type TileCategory = "question" | "mission" | "knowledge" | "special" | "finish";
type TileColor = "red" | "white" | "dark" | "gold";

type BoardTile = {
  cell: number;
  zone: 1 | 2 | 3 | 4;
  category: TileCategory;
  color: TileColor;
  icon: string;
  shortLabel: string;
  cardTitle: string;
  description: string;
  knowledgeTip?: string;
  options?: string[];
  correctIndex?: number;
  explanation: string;
  points: number;
  moveDelta?: number;
};

// 📌 ข้อมูลกระดาน 30 ช่อง (คละกิจกรรม ไม่ซ้ำกัน)
const BOARD_TILES_DATA: BoardTile[] = [
  // ZONE 1 (1-7)
  { cell: 1, zone: 1, category: "knowledge", color: "white", icon: "💡", shortLabel: "ความรู้: รหัสผ่าน", cardTitle: "KNOWLEDGE CARD #01 : กฎเหล็กตั้งรหัสผ่าน", description: "รหัสผ่านที่ดีเปรียบเสมือนกุญแจบ้านดิจิทัล แฮกเกอร์ใช้โปรแกรมสุ่มรหัสได้นับล้านคำต่อวินาที!", knowledgeTip: "ตั้งรหัสผ่านยาวอย่างน้อย 12 ตัวอักษร ผสมตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และสัญลักษณ์ หรือใช้วลียาวๆ เช่น Eat_Somtum#2026", explanation: "รับความรู้ใหม่ รับ +10 คะแนน!", points: 10 },
  { cell: 2, zone: 1, category: "question", color: "red", icon: "❓", shortLabel: "คำถาม: รหัสเสี่ยง", cardTitle: "SITUATION CARD #02 : รหัสผ่านไหนเสี่ยงที่สุด?", description: "รหัสผ่านในข้อใดถูกโปรแกรมแฮกเกอร์เจาะได้ภายในเวลาไม่ถึง 1 วินาที?", options: ["MyDog_Loves_Running@99", "1234567890", "P@ssw0rd_Cyber_Guard_2026!"], correctIndex: 1, explanation: "1234567890 เป็นรหัสผ่านยอดฮิตที่ถูกเจาะได้ทันทีในเสี้ยววินาที!", points: 15 },
  { cell: 3, zone: 1, category: "mission", color: "dark", icon: "🎯", shortLabel: "ภารกิจ: เปิด 2FA", cardTitle: "ONLINE MISSION #03 : เปิดเกราะ 2 ชั้น (2FA)", description: "จงเลือกวิธีตั้งค่า 2FA ที่ปลอดภัยที่สุด!", options: ["ผูกกับแอป Authenticator (เช่น Google/Microsoft)", "เขียนรหัสผ่านแปะไว้ใน Bio", "ปิดการแจ้งเตือนทั้งหมด"], correctIndex: 0, explanation: "ภารกิจสำเร็จ! การใช้แอป Authenticator ช่วยป้องกันบัญชีได้ดีที่สุด (+20 คะแนน, เดินหน้า +1 ช่อง)", points: 20, moveDelta: 1 },
  { cell: 4, zone: 1, category: "knowledge", color: "white", icon: "💡", shortLabel: "ความรู้: รหัสซ้ำ", cardTitle: "KNOWLEDGE CARD #04 : ภัยของการใช้รหัสผ่านซ้ำ", description: "การใช้รหัสเดียวกันทุกเว็บ เสี่ยงต่อการถูกโจมตีแบบ Credential Stuffing", knowledgeTip: "บัญชีสำคัญต้องใช้รหัสแยกกันเสมอ!", explanation: "รับ +10 คะแนน", points: 10 },
  { cell: 5, zone: 1, category: "special", color: "red", icon: "⚡", shortLabel: "พิเศษ: สแกนนิ้ว", cardTitle: "SPECIAL EVENT #05 : อัปเกรด Biometrics", description: "คุณเปิดสแกนนิ้ว/ใบหน้า ปลอดภัยจากการถูกแอบมองรหัส!", explanation: "โบนัสความปลอดภัย! รับ +15 คะแนน และเดินหน้า +1 ช่อง", points: 15, moveDelta: 1 },
  { cell: 6, zone: 1, category: "question", color: "white", icon: "❓", shortLabel: "คำถาม: รหัส OTP", cardTitle: "SITUATION CARD #06 : มีคนขอรหัส OTP", description: "มีคนทักมาว่า 'กรอกเบอร์ผิด ส่งเลข OTP ให้หน่อย' ควรทำอย่างไร?", options: ["ส่งให้ทันที", "ห้ามบอกรหัสเด็ดขาด! และบล็อกทันที", "บอกรหัสไปครึ่งเดียว"], correctIndex: 1, explanation: "ถูกต้อง! มิจฉาชีพมักหลอกเอา OTP ไปสวมรอยบัญชี", points: 15 },
  { cell: 7, zone: 1, category: "mission", color: "red", icon: "🎯", shortLabel: "ภารกิจ: เช็กอุปกรณ์", cardTitle: "ONLINE MISSION #07 : อุปกรณ์ล็อกอินค้าง", description: "ลืมออกจากระบบคอมสาธารณะ ต้องทำอย่างไร?", options: ["เข้าเมนูอุปกรณ์ที่เข้าสู่ระบบ แล้วสั่ง Log out all sessions", "รอพรุ่งนี้ค่อยไปทำ", "ลบบัญชีทิ้ง"], correctIndex: 0, explanation: "การสั่ง Log out ระยะไกลช่วยเซฟบัญชีได้ทันที รับ +20 คะแนน!", points: 20 },
  
  // ZONE 2 (8-15)
  { cell: 8, zone: 2, category: "knowledge", color: "white", icon: "💡", shortLabel: "ความรู้: ฟิชชิง", cardTitle: "KNOWLEDGE CARD #08 : Phishing คืออะไร?", description: "ฟิชชิง คือการหลอกลวงด้วยเหยื่อล่อ เช่น อีเมลปลอม หรือเว็บปลอม เพื่อขโมยรหัสผ่าน", knowledgeTip: "มิจฉาชีพใช้จิตวิทยา 'ทำให้ตกใจกลัว' หรือ 'ทำให้โลภ' เพื่อให้เรารีบกดลิงก์โดยไม่คิด!", explanation: "ตั้งสติก่อนกดลิงก์ รับ +10 คะแนน", points: 10 },
  { cell: 9, zone: 2, category: "question", color: "red", icon: "❓", shortLabel: "คำถาม: SMS แบงก์", cardTitle: "SITUATION CARD #09 : SMS บัญชีมีปัญหา", description: "SMS อ้างธนาคาร 'บัญชีจะถูกระงับ กดลิงก์ด่วน' ข้อใดถูกต้อง?", options: ["เป็นของจริง", "ของปลอม 100% เพราะธนาคารยกเลิกการส่งลิงก์ผ่าน SMS แล้ว", "ต้องรีบกดลิงก์"], correctIndex: 1, explanation: "ธนาคารจริงไม่มีนโยบายส่งลิงก์ทาง SMS เด็ดขาด!", points: 15 },
  { cell: 10, zone: 2, category: "mission", color: "dark", icon: "🎯", shortLabel: "ภารกิจ: สแกน URL", cardTitle: "ONLINE MISSION #10 : จับผิด URL ปลอม", description: "ชื่อเว็บไซต์ใดคือเว็บปลอม?", options: ["https://www.faceb00k-login.xyz", "https://www.facebook.com", "https://www.google.com"], correctIndex: 0, explanation: "มิจฉาชีพใช้เลข 0 แทนตัว o รับ +20 คะแนน!", points: 20 },
  { cell: 11, zone: 2, category: "knowledge", color: "white", icon: "💡", shortLabel: "ความรู้: แม่กุญแจ", cardTitle: "KNOWLEDGE CARD #11 : แม่กุญแจ HTTPS ปลอดภัยชัวร์?", description: "รูปแม่กุญแจแปลว่าเข้ารหัสข้อมูล แต่มิจฉาชีพก็ทำเว็บปลอมมีแม่กุญแจได้!", knowledgeTip: "ต้องตรวจสอบที่ตัวสะกดชื่อ URL เป็นหลักเสมอ ห้ามเชื่อแค่แม่กุญแจ", explanation: "รับ +10 คะแนน", points: 10 },
  { cell: 12, zone: 2, category: "special", color: "red", icon: "⚡", shortLabel: "พิเศษ: พัสดุปลอม", cardTitle: "SPECIAL EVENT #12 : สกัดกั้น SMS พัสดุ", description: "ไม่กดลิงก์พัสดุแปลกปลอม แต่เช็กผ่านแอปทางการแทน!", explanation: "ไหวพริบเยี่ยม! รับ +15 คะแนน และเดินหน้า +1 ช่อง", points: 15, moveDelta: 1 },
  { cell: 13, zone: 2, category: "question", color: "white", icon: "❓", shortLabel: "คำถาม: อีเมลปลอม", cardTitle: "SITUATION CARD #13 : อีเมลถูกรางวัลใหญ่", description: "อีเมลบอกได้ iPad ฟรี แต่ต้องกรอกบัตรเครดิตจ่ายค่าส่ง 50 บาท?", options: ["รีบกรอกเลขบัตรเครดิต", "ลบอีเมลทิ้งเพราะหลอกเอาข้อมูลบัตร", "ส่งให้เพื่อนช่วยดู"], correctIndex: 1, explanation: "โจรใช้ค่าส่งถูกๆ หลอกเอาบัตรไปรูดของแพง", points: 15 },
  { cell: 14, zone: 2, category: "mission", color: "red", icon: "🎯", shortLabel: "ภารกิจ: กู้ภัยลิงก์", cardTitle: "ONLINE MISSION #14 : กรอกรหัสในเว็บปลอม!", description: "เผลอพิมพ์รหัสผ่านในเว็บปลอมไปแล้ว ต้องทำอย่างไร?", options: ["เข้าแอปจริงเปลี่ยนรหัสผ่านด่วน + กดเตะอุปกรณ์อื่นออก", "ปิดเครื่องนอน", "ขอร้องแฮกเกอร์"], correctIndex: 0, explanation: "กู้สถานการณ์ทัน! รับ +20 คะแนน!", points: 20 },
  { cell: 15, zone: 2, category: "knowledge", color: "dark", icon: "💡", shortLabel: "ความรู้: QR ปลอม", cardTitle: "KNOWLEDGE CARD #15 : ระวัง QR Code ฟิชชิง!", description: "สแกน QR Code แล้วต้องดู URL ที่เด้งขึ้นมา ห้ามรีบกดยืนยันหากเว็บไม่คุ้น!", explanation: "รับ +10 คะแนน", points: 10 },
  
  // ZONE 3 (16-22)
  { cell: 16, zone: 3, category: "question", color: "white", icon: "❓", shortLabel: "คำถาม: ไฟล์ .APK", cardTitle: "SITUATION CARD #16 : โหลดไฟล์ .APK", description: "คนส่งไฟล์ .apk ให้ใน LINE หากติดตั้งจะเกิดอะไรขึ้น?", options: ["ได้เงินคืน", "มือถือจะติดแอปดูดเงิน ควบคุมหน้าจอโอนเงินออกไปได้", "เครื่องจะเร็วขึ้น"], correctIndex: 1, explanation: "แอปดูดเงินซ่อนใน .apk ห้ามติดตั้งเด็ดขาด!", points: 15 },
  { cell: 17, zone: 3, category: "mission", color: "red", icon: "🎯", shortLabel: "ภารกิจ: ตัดเน็ตโจร", cardTitle: "ONLINE MISSION #17 : แอปดูดเงินทำหน้าจอค้าง!", description: "ญาติเผลอลงแอปปลอม หน้าจอค้าง ต้องทำอย่างไรทันที?", options: ["รีบถอดซิมการ์ด / ปิด Wi-Fi หรือบังคับปิดเครื่องเพื่อตัดอินเทอร์เน็ต!", "รอให้อัปเดตเสร็จ", "ดูเฉยๆ"], correctIndex: 0, explanation: "แอปดูดเงินต้องใช้เน็ตสั่งการ ตัดเน็ตปุ๊บรอด! (+20 คะแนน, เดินหน้า +1 ช่อง)", points: 20, moveDelta: 1 },
  { cell: 18, zone: 3, category: "knowledge", color: "white", icon: "💡", shortLabel: "ความรู้: สิทธิ์แอป", cardTitle: "KNOWLEDGE CARD #18 : สิทธิ์ Accessibility คือจุดตาย", description: "แอปหลอกเปิดสิทธิ์ 'ช่วยเหลือพิเศษ' เพื่อให้มองเห็นและกดหน้าจอแทนเราได้ ห้ามเปิดให้แอปแปลกเด็ดขาด!", explanation: "รับ +10 คะแนน", points: 10 },
  { cell: 19, zone: 3, category: "question", color: "dark", icon: "❓", shortLabel: "คำถาม: โปรแกรมเถื่อน", cardTitle: "SITUATION CARD #19 : โหลดตัว Crack", description: "เว็บแจก Crack สั่งให้ 'ปิด Antivirus ก่อนติดตั้ง' เพราะอะไร?", options: ["เพราะแคร็กฝังมัลแวร์ จึงหลอกให้เราปิดเกราะ", "เพื่อให้โหลดเร็ว", "เป็นขั้นตอนปกติ"], correctIndex: 0, explanation: "โปรแกรมเถื่อนคือแหล่งไวรัสเรียกค่าไถ่อันดับ 1", points: 15 },
  { cell: 20, zone: 3, category: "special", color: "red", icon: "⚡", shortLabel: "พิเศษ: Backup", cardTitle: "SPECIAL EVENT #20 : ระบบสำรองข้อมูลทำงาน!", description: "ไวรัสโจมตี แต่คุณ Backup ไฟล์ไว้ใน External Drive ข้อมูลจึงปลอดภัย!", explanation: "ป้องกันสมบูรณ์! รับ +15 คะแนน", points: 15 },
  { cell: 21, zone: 3, category: "mission", color: "white", icon: "🎯", shortLabel: "ภารกิจ: แยกไฟล์", cardTitle: "ONLINE MISSION #21 : ไฟล์ต้องสงสัย", description: "ไฟล์ใดคือนามสกุลซ่อนรูปของแฮกเกอร์?", options: ["ใบแจ้งหนี้.pdf.exe", "ตารางเรียน.pdf", "รูปถ่าย.jpg"], correctIndex: 0, explanation: "โจรหลอกตั้งชื่อ .pdf แต่ลงท้าย .exe รับ +20 คะแนน!", points: 20 },
  { cell: 22, zone: 3, category: "knowledge", color: "red", icon: "💡", shortLabel: "ความรู้: อัปเดต", cardTitle: "KNOWLEDGE CARD #22 : ควรอัปเดต OS เสมอ", description: "การอัปเดต OS คือการ 'อุดช่องโหว่ความปลอดภัย' ที่แฮกเกอร์ใช้เจาะระบบ", explanation: "รับ +10 คะแนน", points: 10 },

  // ZONE 4 (23-30)
  { cell: 23, zone: 4, category: "question", color: "white", icon: "❓", shortLabel: "คำถาม: โพสต์ตั๋ว", cardTitle: "SITUATION CARD #23 : โพสต์รูปตั๋ว/บาร์โค้ด", description: "โพสต์รูปตั๋วเครื่องบินให้เห็นบาร์โค้ด เสี่ยงอย่างไร?", options: ["ไม่เสี่ยง", "มิจฉาชีพนำบาร์โค้ดไปดึงข้อมูลส่วนตัวหรือยกเลิกตั๋วได้", "คนกดไลก์น้อย"], correctIndex: 1, explanation: "ข้อมูลสำคัญห้ามโพสต์เด็ดขาด! (Oversharing)", points: 15 },
  { cell: 24, zone: 4, category: "mission", color: "dark", icon: "🎯", shortLabel: "ภารกิจ: Wi-Fi ฟรี", cardTitle: "ONLINE MISSION #24 : โอนเงินนอกบ้าน", description: "จะโอนเงินแต่เจอ Wi-Fi ฟรีไม่ล็อกรหัส ควรทำอย่างไร?", options: ["ปิด Wi-Fi แล้วสลับใช้เน็ตมือถือ (4G/5G) ในการโอนเงิน", "ต่อ Wi-Fi ฟรี", "ยืมมือถือเพื่อน"], correctIndex: 0, explanation: "Wi-Fi สาธารณะอาจโดนดักข้อมูลได้ รับ +20 คะแนน!", points: 20 },
  { cell: 25, zone: 4, category: "knowledge", color: "red", icon: "💡", shortLabel: "ความรู้: Deepfake", cardTitle: "KNOWLEDGE CARD #25 : รู้ทัน AI Deepfake", description: "มิจฉาชีพปลอมหน้าและเสียงเพื่อนมาวิดีโอคอลยืมเงิน ให้วางสายแล้วโทรกลับเบอร์มือถือจริงเสมอ!", explanation: "รับ +10 คะแนน", points: 10 },
  { cell: 26, zone: 4, category: "question", color: "white", icon: "❓", shortLabel: "คำถาม: สายตำรวจ", cardTitle: "SITUATION CARD #26 : สายอ้างเป็นตำรวจ", description: "อ้างเป็นตำรวจไซเบอร์ ให้โอนเงินมาตรวจสอบ ข้อใดถูกต้อง?", options: ["โอนไปให้ตรวจ", "ตำรวจไม่มีนโยบายให้โอนเงินมาตรวจเด็ดขาด วางสายบล็อกทันที!", "บอกรหัสผ่านให้เขาไปเช็ก"], correctIndex: 1, explanation: "ท่องไว้: ตำรวจจริงไม่แอดไลน์ ไม่ให้โอนเงินตรวจ!", points: 15 },
  { cell: 27, zone: 4, category: "mission", color: "red", icon: "🎯", shortLabel: "ภารกิจ: เพจปลอม", cardTitle: "ONLINE MISSION #27 : เช็กเพจที่พักปลอม", description: "จะจองที่พักใน Facebook ต้องเช็กจุดไหนก่อนโอน?", options: ["เช็ก 'ความโปร่งใสของเพจ' และบัญชีต้องเป็นชื่อนิติบุคคล", "ดูยอดไลก์หลักแสน", "โอนไปก่อน"], correctIndex: 0, explanation: "เพจปลอมมักเพิ่งสร้างและใช้บัญชีม้าชื่อคน รับ +20 คะแนน!", points: 20, moveDelta: 1 },
  { cell: 28, zone: 4, category: "special", color: "dark", icon: "⚡", shortLabel: "พิเศษ: เบอร์ 1441", cardTitle: "SPECIAL EVENT #28 : ศูนย์ AOC 1441", description: "คุณจำเบอร์ 1441 ศูนย์แจ้งความไซเบอร์ได้ อายัดบัญชีม้าได้ 24 ชม.", explanation: "รับโบนัสความรู้ +15 คะแนน", points: 15 },
  { cell: 29, zone: 4, category: "question", color: "white", icon: "❓", shortLabel: "คำถาม: บัญชีม้า", cardTitle: "SITUATION CARD #29 : โทษของบัญชีม้า", description: "มีคนจ้างเปิดบัญชี 500 บาท ควรรับหรือไม่?", options: ["รับเปิดเลย", "ไม่รับเด็ดขาด! การรับจ้างเปิดบัญชีม้ามีโทษจำคุกและปรับหลักแสน", "ขอเพิ่มราคา"], correctIndex: 1, explanation: "เป็นความผิดทางอาญาขั้นร้ายแรง!", points: 20 },
  { cell: 30, zone: 4, category: "finish", color: "gold", icon: "🏆", shortLabel: "เส้นชัย: GUARDIAN", cardTitle: "🏆 FINAL MISSION #30 : เข้าเส้นชัยสำเร็จ!", description: "โบนัสแห่งความพยายาม! รับคะแนนเข้าเส้นชัย และรอลุ้นผลรวมคะแนนว่าใครคือผู้ชนะที่แท้จริง!", knowledgeTip: "จำไว้เสมอ: ไม่เชื่อ ไม่รีบ ไม่โอน • ตั้งรหัสแกร่ง • ไม่กดลิงก์แปลกปลอม", explanation: "ยอดเยี่ยมมาก รับ +30 แต้มโบนัส", points: 30 },
];

// 📚 ข้อมูลบทเรียน 10 บท แบบจัดเต็ม (พร้อมภาพจำลองและวิดีโอจำลองสถานการณ์)
type VideoScene = { step: number; title: string; actor: string; screenText: string; narration: string; alertLevel: "normal" | "warning" | "danger" | "safe"; };
type VisualMockup = { header: string; subHeader: string; badExampleTitle: string; badExampleItems: string[]; goodExampleTitle: string; goodExampleItems: string[]; redFlags: string[]; };

type CyberLesson = {
  id: string; missionCode: "01" | "02" | "03" | "04" | "05"; missionName: string; icon: string; title: string;
  type: "image" | "video"; duration: string; summary: string; detail: string; keyTakeaways: string[];
  mockup?: VisualMockup; scenes?: VideoScene[];
  quiz: { question: string; options: string[]; correctIndex: number; explanation: string; };
};

const CYBER_LESSONS_DATA: CyberLesson[] = [
  {
    id: "lesson-1", missionCode: "01", missionName: "Digital Identity", icon: "🔐", type: "image", duration: "อ่าน 3 นาที",
    title: "บทที่ 1: รหัสผ่านอ่อนแอ vs รหัสผ่านป้อมปราการ",
    summary: "ตั้งรหัสผ่านอย่างไรให้ปลอดภัยจากการถูกโปรแกรมสุ่มเจาะ (Brute-force)",
    detail: "แฮกเกอร์ใช้คอมพิวเตอร์สุ่มรหัสผ่านนับล้านคำต่อวินาที หากใช้คำทั่วไป วันเกิด หรือเบอร์โทร จะถูกเจาะได้ทันที การใช้รหัสซ้ำกันทุกเว็บก็ทำให้ถูกเจาะยกแผงได้",
    keyTakeaways: ["ยาว 12 ตัวขึ้นไป ผสม A-Z, a-z, 0-9 และสัญลักษณ์", "ใช้ Passphrase วลียาวๆ ที่เดายาก", "ห้ามใช้รหัสซ้ำในบัญชีสำคัญ"],
    mockup: { header: "🔍 ความแข็งแกร่งของรหัสผ่าน", subHeader: "เวลาที่แฮกเกอร์ใช้เจาะรหัส", badExampleTitle: "❌ อันตราย (< 1 วิ)", badExampleItems: ["123456789", "0812345678 (เบอร์)", "somchai1998 (ชื่อ+ปีเกิด)"], goodExampleTitle: "✅ ปลอดภัย (หลายร้อยปี)", goodExampleItems: ["MyCat@Loves2Eat#Tuna!", "Kafe_Yen*2026", "ใช้ Password Manager"], redFlags: ["ใช้รหัสเดิมซ้ำทุกเว็บ"] },
    quiz: { question: "รหัสผ่านใดปลอดภัยจากการถูกเจาะมากที่สุด?", options: ["1234567890abcd", "Somchai_15042545", "I_Love_Cyber_Guardian#2026!", "password@1234"], correctIndex: 2, explanation: "วลียาวผสมสัญลักษณ์ (Passphrase) ปลอดภัยที่สุด" }
  },
  {
    id: "lesson-2", missionCode: "01", missionName: "Digital Identity", icon: "🛡️", type: "video", duration: "วิดีโอจำลอง",
    title: "บทที่ 2: เกราะป้องกัน 2 ชั้น (2FA / MFA)",
    summary: "จำลองสถานการณ์เมื่อรหัสผ่านรั่ว แต่บัญชีรอดเพราะเปิด 2FA",
    detail: "2FA คือการใช้รหัสผ่าน + OTP จากแอป Authenticator ต่อให้แฮกเกอร์ได้รหัสผ่านไปก็ไม่สามารถเข้าบัญชีได้",
    keyTakeaways: ["เปิด 2FA ในทุกแอป (อีเมล, โซเชียล, ธนาคาร)", "แอป Authenticator ปลอดภัยกว่า SMS OTP", "ห้ามบอกรหัส OTP ให้ใครเด็ดขาด"],
    scenes: [
      { step: 1, title: "รหัสผ่านรั่วไหล", actor: "แฮกเกอร์", screenText: "[ALERT] พยายามล็อกอินด้วย Pass: Welcome123", narration: "แฮกเกอร์สุ่มรหัสผ่านชั้นแรกสำเร็จ", alertLevel: "danger" },
      { step: 2, title: "ติดด่าน 2FA", actor: "ระบบ", screenText: "🔒 กรุณากรอกรหัส Authenticator 6 หลัก", narration: "แฮกเกอร์ไปต่อไม่ได้เพราะไม่มีมือถือของคุณ", alertLevel: "warning" },
      { step: 3, title: "แจ้งเตือนเจ้าของบัญชี", actor: "มือถือของคุณ", screenText: "⚠️ มีการล็อกอิน (กด 'ไม่ใช่ฉัน')", narration: "คุณกดปฏิเสธและเปลี่ยนรหัสใหม่ทันที", alertLevel: "safe" }
    ],
    quiz: { question: "มีข้อความขอ OTP ทั้งที่ไม่ได้ล็อกอิน ควรทำอย่างไร?", options: ["ส่งให้เขา", "ห้ามบอกใคร กดปฏิเสธ และเปลี่ยนรหัสผ่านทันที", "เพิกเฉย"], correctIndex: 1, explanation: "แสดงว่ามีคนรู้รหัสผ่านชั้นแรกแล้ว ต้องรีบเปลี่ยนรหัส" }
  },
  {
    id: "lesson-3", missionCode: "02", missionName: "Phishing Attack", icon: "🎣", type: "image", duration: "อ่าน 4 นาที",
    title: "บทที่ 3: จับผิด SMS & อีเมลฟิชชิง",
    summary: "ฝึกสายตาแยกแยะข้อความและอีเมลปลอม",
    detail: "มิจฉาชีพสร้างข้อความปลอม อ้างว่าบัญชีถูกระงับ หรือได้รางวัล เพื่อหลอกให้เหยื่อรีบกดลิงก์กรอกข้อมูล",
    keyTakeaways: ["ธนาคารยกเลิกการส่งลิงก์ทาง SMS แล้ว", "ดู URL ให้ดี เช่น โดเมนที่สะกดผิด (faceb00k)"],
    mockup: { header: "📱 จับผิดข้อความปลอม", subHeader: "ของปลอม vs ของจริง", badExampleTitle: "🚨 ฟิชชิงปลอม", badExampleItems: ["'บัญชีจะถูกอายัด กดลิงก์ด่วน'", "URL: kbank-verify.xyz"], goodExampleTitle: "✅ ปลอดภัย", goodExampleItems: ["ธนาคารไม่ส่งลิงก์ให้กด", "เข้าแอปด้วยตัวเอง"], redFlags: ["เร่งรัดให้ทำทันที", "ขอรหัสและ OTP"] },
    quiz: { question: "ข้อใดคือสัญญาณฟิชชิง?", options: ["แจ้งเตือนเงินเข้าปกติ", "อ้างบัญชีมีปัญหาและแนบลิงก์ให้กรอก OTP ด่วน", "โฆษณาเครือข่ายมือถือไม่มีลิงก์"], correctIndex: 1, explanation: "ธนาคารจริงไม่มีนโยบายส่งลิงก์ทาง SMS" }
  },
  {
    id: "lesson-4", missionCode: "02", missionName: "Phishing Attack", icon: "🌐", type: "video", duration: "วิดีโอจำลอง",
    title: "บทที่ 4: กลลวงเว็บปลอมขโมย OTP เรียลไทม์",
    summary: "ดูเบื้องหลังเว็บปลอมขโมยรหัสผ่านและ OTP ส่งให้โจรทันที",
    detail: "มิจฉาชีพทำเว็บปลอมได้เนียน 100% ทันทีที่เราพิมพ์รหัสผ่าน บอทของโจรจะเอาไปกรอกในเว็บจริงเพื่อขอ OTP เมื่อเรากรอก OTP ในเว็บปลอม โจรก็เอาไปใช้ได้เลย",
    keyTakeaways: ["แม่กุญแจ HTTPS บนเบราว์เซอร์ โจรก็ทำได้ ต้องเช็กโดเมนเสมอ", "อ่าน SMS OTP ให้ละเอียดว่าใช้ทำรายการอะไร"],
    scenes: [
      { step: 1, title: "กดลิงก์ปลอม", actor: "เหยื่อ", screenText: "URL: www.faceb00k-login.com", narration: "เหยื่อเข้าเว็บปลอมและพิมพ์รหัสผ่าน", alertLevel: "warning" },
      { step: 2, title: "ขโมยแบบเรียลไทม์", actor: "บอทแฮกเกอร์", screenText: "ได้รับรหัส! นำไปกรอกเว็บจริงเพื่อดึง OTP", narration: "บอทโจรทำงานแบบอัตโนมัติรวดเร็วมาก", alertLevel: "danger" },
      { step: 3, title: "ไหวตัวทัน", actor: "เหยื่อ", screenText: "🛑 ปิดหน้าเว็บปลอมทันที", narration: "เหยื่อสังเกต URL แปลก จึงไม่กรอก OTP และรอดมาได้", alertLevel: "safe" }
    ],
    quiz: { question: "แม่กุญแจ (HTTPS) หน้าเว็บไซต์แปลว่าอะไร?", options: ["เว็บปลอดภัย 100%", "เว็บได้รับการรับรอง", "ข้อมูลเข้ารหัส แต่เว็บอาจเป็นของโจรปลอมมาก็ได้ ต้องดู URL"], correctIndex: 2, explanation: "โจรขอ HTTPS ได้ฟรี จึงต้องดู URL ควบคู่เสมอ" }
  },
  {
    id: "lesson-5", missionCode: "03", missionName: "Malware Defense", icon: "🦠", type: "image", duration: "อ่าน 4 นาที",
    title: "บทที่ 5: มหันตภัยไฟล์ .APK แฝงแอปดูดเงิน",
    summary: "กลไกแอปดูดเงินนอกสโตร์ ควบคุมมือถือระยะไกล",
    detail: "โจรหลอกส่งไฟล์ .apk ทาง LINE หลอกให้เปิดสิทธิ์ 'การช่วยเหลือพิเศษ (Accessibility)' ทำให้โจรกดหน้าจอโอนเงินออกไปได้เอง",
    keyTakeaways: ["โหลดแอปจาก Store ทางการเท่านั้น", "ห้ามเปิดสิทธิ์ 'ช่วยเหลือพิเศษ' ให้แอปแปลก", "ถ้าหน้าจอค้าง ให้ถอดซิมตัดเน็ตทันที"],
    mockup: { header: "📲 สัญญาณแอปดูดเงิน", subHeader: "พฤติกรรมเสี่ยง vs วิธีรับมือ", badExampleTitle: "☠️ พฤติกรรมเสี่ยง", badExampleItems: ["โหลดไฟล์ .apk จากแชท", "เปิดสิทธิ์ Accessibility"], goodExampleTitle: "🛡️ วิธีแก้ฉุกเฉิน", goodExampleItems: ["ถอดซิม / ปิด Wi-Fi ทันที", "บังคับปิดเครื่อง"], redFlags: ["แอปขอสิทธิ์กดหน้าจอแทนเรา", "หน้าจอค้างบอกกำลังอัปเดต"] },
    quiz: { question: "ถ้าเผลอลงแอปแปลกแล้วหน้าจอค้างกดไม่ได้ ต้องทำไง?", options: ["รออัปเดต", "รีบตัดเน็ตทันที (ถอดซิม/ปิดเครื่อง)", "ทักแชทถามโจร"], correctIndex: 1, explanation: "แอปดูดเงินต้องใช้เน็ตในการสั่งการ ตัดเน็ตคือจบ" }
  },
  {
    id: "lesson-6", missionCode: "03", missionName: "Malware Defense", icon: "💀", type: "video", duration: "วิดีโอจำลอง",
    title: "บทที่ 6: มัลแวร์เรียกค่าไถ่ Ransomware",
    summary: "โปรแกรมเถื่อนแฝงไวรัส ล็อกไฟล์เอกสารทั้งเครื่องเรียกค่าไถ่",
    detail: "Ransomware จะเข้ารหัสไฟล์ในเครื่องและ External drive ที่ต่ออยู่ ทำให้เปิดไม่ได้ และเรียกเงินเพื่อปลดล็อก วิธีเดียวที่รอดคือการสำรองข้อมูล (Backup) แบบออฟไลน์",
    keyTakeaways: ["Backup ข้อมูลสำคัญไว้ภายนอกเสมอ", "ห้ามโหลดโปรแกรมแคร็ก (Crack) เถื่อน", "อัปเดต Antivirus สม่ำเสมอ"],
    scenes: [
      { step: 1, title: "โหลดโปรแกรมเถื่อน", actor: "ผู้ใช้", screenText: "ดาวน์โหลด: Photoshop_Crack.exe", narration: "เว็บสั่งให้ปิด Antivirus ก่อนลงแคร็ก", alertLevel: "warning" },
      { step: 2, title: "ไวรัสทำงาน", actor: "มัลแวร์", screenText: "Encrypting... file.locked", narration: "ไฟล์งานถูกล็อกทั้งหมดอย่างรวดเร็ว", alertLevel: "danger" },
      { step: 3, title: "กู้ไฟล์จาก Backup", actor: "ผู้ใช้", screenText: "ล้างเครื่อง -> Restore จาก External Drive", narration: "ผู้ใช้ไม่ต้องจ่ายเงินโจร เพราะดึงไฟล์กลับจาก External Drive ที่ถอดสายเก็บไว้", alertLevel: "safe" }
    ],
    quiz: { question: "วิธีป้องกัน Ransomware ที่ดีที่สุด?", options: ["ปิด Antivirus", "Backup ข้อมูลเก็บแยกไว้และไม่ใช้โปรแกรมเถื่อน", "จ่ายค่าไถ่"], correctIndex: 1, explanation: "การ Backup เก็บแยกอุปกรณ์คือเกราะป้องกันที่ดีที่สุด" }
  },
  {
    id: "lesson-7", missionCode: "04", missionName: "Privacy Protection", icon: "🕵️", type: "image", duration: "อ่าน 3 นาที",
    title: "บทที่ 7: อันตรายจากการโพสต์เกินพอดี (Oversharing)",
    summary: "รอยเท้าดิจิทัล ข้อมูลอะไรบ้างที่แฮกเกอร์แอบเก็บจากคุณ",
    detail: "การโพสต์บาร์โค้ดตั๋ว บัตรประชาชน หรือบอกว่าไม่อยู่บ้าน จะเป็นช่องทางให้โจรขโมยข้อมูลไปทำธุรกรรม หรือบุกรุกบ้านได้",
    keyTakeaways: ["เบลอบาร์โค้ด เลขตั๋ว PNR ก่อนโพสต์", "ลงรูปท่องเที่ยวหลังกลับถึงบ้านแล้ว", "ตั้งค่า Privacy เป็นเฉพาะเพื่อน"],
    mockup: { header: "📸 แชร์ปลอดภัย vs เสี่ยงภัย", subHeader: "สิ่งที่มิจฉาชีพจ้องมอง", badExampleTitle: "❌ โพสต์อันตราย", badExampleItems: ["รูปตั๋วเห็นบาร์โค้ด PNR", "ถ่ายติดบัตรประชาชน/ป้ายทะเบียน", "เช็กอินว่าไม่อยู่บ้าน 7 วัน"], goodExampleTitle: "✅ แชร์ปลอดภัย", goodExampleItems: ["เบลอข้อมูลสำคัญ", "Delay Posting โพสต์หลังกลับ", "ตั้งโพสต์เฉพาะเพื่อน"], redFlags: ["เปิด Public โปรไฟล์ที่มีที่อยู่ชัดเจน"] },
    quiz: { question: "ทำไมห้ามโพสต์บาร์โค้ดตั๋วเครื่องบิน?", options: ["ภาพไม่สวย", "โจรเอาบาร์โค้ดและเลข PNR ไปเช็กข้อมูลหรือยกเลิกเที่ยวบินได้", "สายการบินจะปรับเงิน"], correctIndex: 1, explanation: "บาร์โค้ดซ่อนข้อมูลสำคัญและเข้าจัดการบุ๊กกิ้งได้" }
  },
  {
    id: "lesson-8", missionCode: "04", missionName: "Privacy Protection", icon: "📶", type: "video", duration: "วิดีโอจำลอง",
    title: "บทที่ 8: กับดัก Wi-Fi ฟรี (Man-in-the-Middle)",
    summary: "แฮกเกอร์ตั้งฮอตสปอตปลอมดักข้อมูลการโอนเงิน",
    detail: "มิจฉาชีพสร้าง Wi-Fi ชื่อเลียนแบบร้านกาแฟโดยไม่ใส่รหัสผ่าน เพื่อล่อให้คนเชื่อมต่อ จากนั้นใช้โปรแกรมดักจับรหัสบัตรเครดิตที่เหยื่อพิมพ์",
    keyTakeaways: ["ห้ามโอนเงินผ่าน Wi-Fi สาธารณะ", "ใช้ 4G/5G จากซิมส่วนตัวทำธุรกรรมเสมอ", "ปิดออโต้จอย Wi-Fi"],
    scenes: [
      { step: 1, title: "Wi-Fi ปลอม", actor: "แฮกเกอร์", screenText: "ปล่อยสัญญาณ: 'Free_Cafe_WiFi'", narration: "แฮกเกอร์ปล่อยสัญญาณปลอมในร้านกาแฟ", alertLevel: "danger" },
      { step: 2, title: "เผลอเชื่อมต่อ", actor: "เหยื่อ", screenText: "เชื่อมต่อสำเร็จ กำลังกรอกเลขบัตรเครดิต", narration: "เหยื่อกำลังจะซื้อของออนไลน์", alertLevel: "warning" },
      { step: 3, title: "สลับใช้เน็ตตัวเอง", actor: "เหยื่อ", screenText: "ปิด Wi-Fi -> เปิด 5G โอนเงิน", narration: "นึกได้ว่าอันตราย จึงสลับมาใช้เน็ตส่วนตัว ทำให้แฮกเกอร์ดักข้อมูลไม่ได้", alertLevel: "safe" }
    ],
    quiz: { question: "ถ้าต้องโอนเงินด่วนนอกบ้าน ควรใช้อินเทอร์เน็ตแบบใด?", options: ["Wi-Fi ฟรีของห้าง", "เน็ต 4G/5G มือถือตัวเอง", "ยืมเน็ตคนอื่น"], correctIndex: 1, explanation: "เน็ตมือถือตัวเองเข้ารหัสปลอดภัยที่สุด ไม่โดนดักกลางทาง" }
  },
  {
    id: "lesson-9", missionCode: "05", missionName: "Cyber Mission", icon: "🎭", type: "video", duration: "วิดีโอจำลอง",
    title: "บทที่ 9: แก๊งคอลเซ็นเตอร์ & AI Deepfake ปลอมหน้า",
    summary: "มิจฉาชีพใช้ AI ปลอมใบหน้าและเสียงเพื่อนมาวิดีโอคอลยืมเงิน",
    detail: "เทคโนโลยี AI Deepfake สามารถดึงคลิปจากโซเชียลมาโคลนเสียงให้พูดตามสคริปต์ได้เนียนมาก รวมถึงการโทรอ้างเป็นตำรวจไซเบอร์ขู่ฟอกเงิน",
    keyTakeaways: ["ตำรวจไม่มีนโยบายสอบสวนผ่าน LINE หรือให้โอนเงินมาตรวจ", "ถ้าเพื่อนวิดีโอคอลมายืมเงิน ให้วางสายแล้วโทรเบอร์ตรงกลับไปเช็กเสมอ", "ตั้งรหัสลับครอบครัว"],
    scenes: [
      { step: 1, title: "วิดีโอคอลฉุกเฉิน", actor: "AI Deepfake", screenText: "ภาพเพื่อน: 'เราเกิดอุบัติเหตุ โอนเงินมาให้หน่อย ด่วน!'", narration: "โจรใช้ AI ปลอมหน้าเพื่อนขยับปากพูดสั้นๆ แล้วตัดสาย", alertLevel: "danger" },
      { step: 2, title: "เช็กชื่อบัญชี", actor: "เหยื่อ", screenText: "บัญชีปลายทาง: นายสมศักดิ์ (ชื่อแปลก)", narration: "เหยื่อสังเกตว่าชื่อบัญชีไม่ใช่ชื่อเพื่อน", alertLevel: "warning" },
      { step: 3, title: "โทรเช็กเบอร์จริง", actor: "เหยื่อ", screenText: "โทรหาเพื่อน... 'เราอยู่บ้าน เฟซโดนแฮก!'", narration: "การโทรเบอร์มือถือจริงช่วยเปิดโปงโจรได้ทันที", alertLevel: "safe" }
    ],
    quiz: { question: "ตำรวจไซเบอร์โทรมาบอกว่าคุณฟอกเงิน ต้องโอนไปตรวจสอบ?", options: ["โอนไปให้ตรวจ", "วางสายบล็อก! ตำรวจไม่สอบผ่านไลน์และไม่รับโอนเงินตรวจสอบ", "บอกรหัสธนาคาร"], correctIndex: 1, explanation: "ตำรวจจริงไม่แอดไลน์ ไม่ขอให้โอนเงินมาตรวจสอบความบริสุทธิ์เด็ดขาด" }
  },
  {
    id: "lesson-10", missionCode: "05", missionName: "Cyber Mission", icon: "🛍️", type: "image", duration: "อ่าน 4 นาที",
    title: "บทที่ 10: รู้ทันเพจที่พักปลอม & บัญชีม้า",
    summary: "ตรวจสอบเพจ Facebook ปลอม และระวังคุกจากการรับจ้างเปิดบัญชีม้า",
    detail: "มิจฉาชีพสร้างเพจที่พักหรูลดราคาเกินจริง ซื้อโฆษณา Sponsored และปั๊มยอดไลก์หลักแสน ให้เราเช็กที่ 'ความโปร่งใสของเพจ' เสมอ",
    keyTakeaways: ["เช็ก Page Transparency ดูประวัติเปลี่ยนชื่อ และวันที่สร้าง", "โรงแรมหรือร้านใหญ่ควรโอนเข้าชื่อบริษัท/นิติบุคคล ไม่ใช่บุคคลธรรมดา", "โทษเปิดบัญชีม้า จำคุก 3 ปี ปรับ 3 แสน"],
    mockup: { header: "🛍️ เช็กชัวร์ก่อนโอน", subHeader: "จุดสังเกตเพจมิจฉาชีพ vs เพจจริง", badExampleTitle: "🚩 สัญญาณเพจปลอม", badExampleItems: ["เพิ่งสร้างเพจ หรือมีประวัติเปลี่ยนชื่อแปลกๆ", "โอนเข้าบัญชีชื่อบุคคลธรรมดา", "ลดราคา 70% ให้โอนใน 10 นาที"], goodExampleTitle: "✅ เพจจริงปลอดภัย", goodExampleItems: ["เพจสร้างมานาน ไม่เปลี่ยนชื่อ", "บัญชีนิติบุคคลตรงชื่อโรงแรม", "โทรเช็กเบอร์โทรจาก Google Maps"], redFlags: ["โพสต์ปิดคอมเมนต์ มีคนกดหน้าโกรธ"] },
    quiz: { question: "วิธีเช็กเพจที่พักในเฟซบุ๊กที่แม่นยำที่สุดคือข้อใด?", options: ["ดูยอดไลก์ว่าถึงแสนไหม", "เข้าไปดู 'ความโปร่งใสของเพจ' และเช็กว่าเลขบัญชีเป็นชื่อนิติบุคคลหรือไม่", "ดูว่ามีคำว่า Sponsored ไหม"], correctIndex: 1, explanation: "ยอดไลก์ซื้อปั๊มได้ ต้องเช็กประวัติเพจและชื่อบัญชีโอนเงินให้ตรงนิติบุคคล" }
  },
];

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

  // การแสดงผลบนกระดานและโมดอลคำถาม
  const [activeTileModal, setActiveTileModal] = useState<BoardTile | null>(null);
  const [tileOptionSelected, setTileOptionSelected] = useState<number | null>(null);
  const [tileCompleted, setTileCompleted] = useState<boolean>(false);

  // แอนิเมชันเดินกระดานทีละก้าว (Step-by-step Local Animation)
  const [localPos, setLocalPos] = useState<Record<string, number>>({});
  const [isAnimating, setIsAnimating] = useState(false);

  // หน้าต่างการ์ดพรีวิวตรงกลางกระดาน
  const [previewDeckCategory, setPreviewDeckCategory] = useState<TileCategory | null>(null);

  // หน้าต่างวิดีโอสอน (Cyber Academy)
  const [showLessonTutorial, setShowLessonTutorial] = useState<boolean>(false);

  // บทเรียน
  const [selectedMissionFilter, setSelectedMissionFilter] = useState<string>("all");
  const [activeLesson, setActiveLesson] = useState<CyberLesson>(CYBER_LESSONS_DATA[0]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(0);
  const [isPlayingVideoSim, setIsPlayingVideoSim] = useState<boolean>(false);
  const [lessonQuizAnswer, setLessonQuizAnswer] = useState<number | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);

  // ซิงค์ฐานข้อมูลผู้เล่นและห้องเกม
  useEffect(() => {
    if (!room?.id) return;
    let active = true;

    async function loadData() {
      const { data: pData } = await supabase.from("game_players").select("*").eq("room_id", room!.id).order("joined_at", { ascending: true });
      const { data: rData } = await supabase.from("game_rooms").select("*").eq("id", room!.id).maybeSingle();
      if (!active) return;
      if (pData) setPlayers(pData as GamePlayer[]);
      if (rData) setRoom(rData as GameRoom);
      else { setRoom(null); setScreen("home"); }
    }

    void loadData();
    const ch = supabase.channel(`game-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `room_id=eq.${room.id}` }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${room.id}` }, loadData)
      .subscribe();

    const t = setInterval(loadData, 3000);
    return () => { active = false; clearInterval(t); void supabase.removeChannel(ch); };
  }, [room?.id, supabase]);

  // ซิงค์ตำแหน่งหมาก Local สำหรับแอนิเมชัน
  useEffect(() => {
    if (!isAnimating && room?.game_state?.positions) {
      setLocalPos(room.game_state.positions);
    }
  }, [room?.game_state?.positions, isAnimating]);

  // เล่นวิดีโอจำลองสถานการณ์อัตโนมัติในหน้าบทเรียน
  useEffect(() => {
    if (!isPlayingVideoSim || activeLesson.type !== "video" || !activeLesson.scenes) return;
    const totalScenes = activeLesson.scenes.length;
    const timer = setInterval(() => {
      setCurrentSceneIndex((prev) => {
        if (prev + 1 >= totalScenes) { setIsPlayingVideoSim(false); return prev; }
        return prev + 1;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [isPlayingVideoSim, activeLesson]);

  function selectLesson(lesson: CyberLesson) {
    setActiveLesson(lesson);
    setCurrentSceneIndex(0);
    setIsPlayingVideoSim(false);
    setLessonQuizAnswer(null);
  }

  async function ensureSignedIn(): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      setUserId(sessionData.session.user.id);
      return sessionData.session.user.id;
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) throw new Error("ไม่สามารถเชื่อมต่อบัญชีได้");
    setUserId(data.user.id);
    return data.user.id;
  }

  async function createRoom() {
    if (!playerName.trim()) { setMessage("กรุณากรอกชื่อผู้เล่นก่อนสร้างห้อง"); return; }
    setBusy(true); setMessage("");
    try {
      const hostId = await ensureSignedIn();
      let newRoom: GameRoom | null = null;
      for (let i = 0; i < 5; i++) {
        const code = "CG" + Math.floor(1000 + Math.random() * 9000);
        const { data } = await supabase.from("game_rooms").insert({ room_code: code, host_id: hostId, status: "waiting", max_players: 4, mode }).select("*").single();
        if (data) { newRoom = data as GameRoom; break; }
      }
      if (!newRoom) throw new Error("สร้างห้องไม่สำเร็จ");
      const { data: pData } = await supabase.from("game_players").insert({ room_id: newRoom.id, user_id: hostId, player_name: playerName.trim() }).select("*").single();
      setRoom(newRoom);
      setPlayers(pData ? [pData as GamePlayer] : []);
      setScreen("room");
    } catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  }

  async function joinRoom() {
    const code = roomCode.trim().toUpperCase();
    if (!playerName.trim()) { setMessage("กรุณากรอกชื่อ"); return; }
    if (!/^[A-Z0-9]{6}$/.test(code)) { setMessage("รหัส 6 หลักเท่านั้น"); return; }
    setBusy(true); setMessage("");
    try {
      const uid = await ensureSignedIn();
      const { data: rData } = await supabase.from("game_rooms").select("*").eq("room_code", code).maybeSingle();
      if (!rData) throw new Error("ไม่พบห้องนี้");
      const rm = rData as GameRoom;
      if (rm.status !== "waiting") throw new Error("ห้องนี้เริ่มเล่นไปแล้ว");

      const { data: pList } = await supabase.from("game_players").select("id, user_id").eq("room_id", rm.id);
      const isJoined = (pList || []).some(p => p.user_id === uid);
      if (!isJoined) {
        if ((pList || []).length >= rm.max_players) throw new Error("ห้องเต็มแล้ว");
        await supabase.from("game_players").insert({ room_id: rm.id, user_id: uid, player_name: playerName.trim() });
      }
      setRoom(rm); setScreen("room");
    } catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  }

  async function startGame() {
    if (!room || room.host_id !== userId || players.length < 2) return;
    setBusy(true);
    try {
      const turnOrder = players.map(p => p.user_id);
      const gs: GameState = {
        positions: Object.fromEntries(players.map(p => [p.user_id, 0])),
        scores: Object.fromEntries(players.map(p => [p.user_id, 0])),
        turn_order: turnOrder,
        current_turn_index: 0,
        started: true,
        last_roll: null,
      };
      const { data } = await supabase.from("game_rooms").update({ status: "playing", game_state: gs }).eq("id", room.id).select("*").single();
      if (data) setRoom(data as GameRoom);
    } catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  }

  // แอนิเมชันเดินทีละก้าว (แบบ The True Guardian หาคนชนะที่คะแนน)
  async function rollDice() {
    if (!room) return;
    setBusy(true); setMessage("");
    try {
      const { data } = await supabase.from("game_rooms").select("*").eq("id", room.id).single();
      const gs = (data as GameRoom).game_state;
      if (gs.turn_order[gs.current_turn_index] !== userId) throw new Error("ยังไม่ถึงตาของคุณ!");
      
      const dice = Math.floor(Math.random() * 6) + 1;
      const oldPosition = gs.positions[userId] ?? 0;
      const newPosition = Math.min(30, oldPosition + dice);
      const isReachingFinish = newPosition >= 30;

      const nextState: GameState = {
        ...gs,
        positions: { ...gs.positions, [userId]: newPosition },
        last_roll: dice,
        current_turn_index: isReachingFinish ? gs.current_turn_index : (gs.current_turn_index + 1) % gs.turn_order.length,
      };

      // บันทึกลง Supabase ก่อนให้เพื่อนคนอื่นเห็นการเดิน
      await supabase.from("game_rooms").update({ game_state: nextState }).eq("id", room.id);

      // เริ่มแอนิเมชันให้คนกดทอย
      setIsAnimating(true);
      let step = oldPosition;
      setMessage(`🎲 คุณทอยได้ ${dice} แต้ม! กำลังเดิน...`);

      const walkInterval = setInterval(() => {
        step++;
        setLocalPos(prev => ({ ...prev, [userId]: step }));

        if (step >= newPosition) {
          clearInterval(walkInterval);
          setIsAnimating(false);

          const landedTile = BOARD_TILES_DATA.find((t) => t.cell === newPosition) ?? BOARD_TILES_DATA[0];
          setActiveTileModal(landedTile);
          setTileOptionSelected(null);
          setTileCompleted(false);

          if (isReachingFinish) {
            setMessage(`📍 เดินถึงช่อง 30 แล้ว! รีบกดรับโบนัสเข้าเส้นชัย เพื่อลุ้นผู้ชนะตัวจริง!`);
          } else {
            setMessage(`📍 เดินมาถึงช่องที่ ${newPosition} (${landedTile.shortLabel})`);
          }
          setBusy(false);
        }
      }, 300); // 0.3 วินาทีต่อก้าว

    } catch (e: any) { 
      setMessage(e.message); 
      setBusy(false); 
    } 
  }

  // คำนวณกิจกรรมและตัดสินผู้ชนะตัวจริงจากคะแนน
  async function completeTileActivity(selectedIdx?: number) {
    if (!activeTileModal || !room || tileCompleted) return;
    if (selectedIdx !== undefined) setTileOptionSelected(selectedIdx);
    setTileCompleted(true);

    const isCorrect = activeTileModal.options ? selectedIdx === activeTileModal.correctIndex : true;
    const earned = isCorrect ? activeTileModal.points : 5; // ตอบผิดได้แต้มปลอบใจ +5
    const move = (isCorrect && activeTileModal.moveDelta) ? activeTileModal.moveDelta : 0;

    try {
      const { data } = await supabase.from("game_rooms").select("*").eq("id", room.id).single();
      const gs = (data as GameRoom).game_state;
      const currentScore = gs.scores[userId] ?? 0;
      const updatedPos = Math.min(30, Math.max(1, (gs.positions[userId] ?? 0) + move));
      const isFinished = updatedPos >= 30;

      const newScores = { ...gs.scores, [userId]: currentScore + earned };
      let finalWinnerId = gs.winner_id;

      // กฎ The True Guardian: คนที่คะแนนรวมเยอะที่สุดตอนเกมจบคือผู้ชนะ
      if (isFinished) {
        let maxScore = -1;
        for (const p of players) {
          const pScore = newScores[p.user_id] ?? 0;
          if (pScore > maxScore) {
            maxScore = pScore;
            finalWinnerId = p.user_id;
          }
        }
      }
      
      await supabase.from("game_rooms").update({
        game_state: { 
          ...gs, 
          scores: newScores, 
          positions: { ...gs.positions, [userId]: updatedPos },
          winner_id: finalWinnerId 
        },
        status: isFinished ? "finished" : room.status
      }).eq("id", room.id);

    } catch (err) {
      console.error("อัปเดตข้อมูลไม่สำเร็จ:", err);
    }
  }

  async function leaveRoom() {
    if (!room) return;
    if (room.host_id === userId) await supabase.from("game_rooms").delete().eq("id", room.id);
    else await supabase.from("game_players").delete().eq("room_id", room.id).eq("user_id", userId);
    setRoom(null); setScreen("home");
  }

  // ตัวช่วยวาดช่องกระดาน พร้อมแสดงการ์ตูนตัวเดิน
  function renderBoardTile(tile: BoardTile) {
    const cellPlayers = players.filter(p => (localPos[p.user_id] ?? 0) === tile.cell);
    return (
      <button key={tile.cell} onClick={() => { setActiveTileModal(tile); setTileOptionSelected(null); setTileCompleted(false); }} className={`group relative flex min-h-[95px] flex-col justify-between rounded-2xl p-2 text-left transition-transform hover:scale-105 border-2 shadow-lg ${tile.color === "white" ? "bg-white text-black border-red-600 shadow-[0_0_10px_rgba(255,255,255,0.25)]" : tile.color === "red" ? "bg-gradient-to-br from-red-600 to-red-800 text-white border-red-300 shadow-[0_0_12px_rgba(220,38,38,0.45)]" : tile.color === "gold" ? "bg-gradient-to-br from-yellow-400 to-red-600 text-black border-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.7)]" : "bg-[#13090c] text-white border-red-700/80 shadow-[inset_0_0_12px_rgba(220,38,38,0.3)]"} ${cellPlayers.length > 0 ? "ring-4 ring-yellow-400 scale-105 z-10" : ""}`}>
        <div className="flex w-full items-center justify-between gap-1">
          <span className={`rounded-md px-1.5 py-0.5 font-mono text-xs font-black ${tile.color === "white" ? "bg-red-600 text-white" : "bg-black/60 text-white"}`}>{String(tile.cell).padStart(2, "0")}</span>
          <span className="text-[10px]">{tile.icon}</span>
        </div>
        <div className="my-1 text-[11px] font-extrabold leading-tight">{tile.shortLabel}</div>
        
        {/* แสดงอวาตาร์การ์ตูนสำหรับตัวเดินของผู้เล่นบนช่อง */}
        {cellPlayers.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {cellPlayers.map(p => {
               const pIndex = players.findIndex(x => x.id === p.id);
               const avatar = PLAYER_AVATARS[pIndex % PLAYER_AVATARS.length];
               return (
                 <span key={p.id} title={p.player_name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-b from-blue-300 to-blue-500 text-lg shadow-md hover:scale-110 transition-transform">
                   {avatar}
                 </span>
               );
            })}
          </div>
        ) : (
          <span className={`text-[9px] font-bold opacity-75 ${tile.color === "white" ? "text-red-700" : "text-gray-200"}`}>+{tile.points} แต้ม</span>
        )}
      </button>
    );
  }

  const filteredLessons = selectedMissionFilter === "all" ? CYBER_LESSONS_DATA : CYBER_LESSONS_DATA.filter(l => l.missionCode === selectedMissionFilter);

  return (
    <main className="min-h-screen bg-[#09090c] text-white">
      {/* Header */}
      <header className="border-b border-red-900 bg-black px-5 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={() => { if (!room) { setScreen("home"); setMessage(""); } }} className="flex items-center gap-3 text-left">
            <span className="text-4xl">🛡️</span>
            <span><span className="block text-lg font-black">CYBER <span className="text-red-500">GUARDIAN</span></span><span className="text-xs text-gray-400">ภารกิจพิชิตภัยไซเบอร์</span></span>
          </button>
          <div className="flex items-center gap-3">
            {!room && <button onClick={() => setScreen("lessons")} className="rounded-xl border border-red-700 bg-red-950/60 px-4 py-2 text-xs font-bold hover:bg-red-900">📚 10 บทเรียนไซเบอร์</button>}
            <span className="hidden rounded-full border border-red-800 px-3 py-2 text-xs text-red-300 sm:block">ONLINE BOARD GAME</span>
          </div>
        </div>
      </header>

      {/* Home Screen */}
      {screen === "home" && (
        <section className="relative overflow-hidden bg-gradient-to-br from-red-950 via-black to-black">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-20">
            <div>
              <span className="rounded-full border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-300">🎮 CYBER SECURITY BOARD GAME</span>
              <h1 className="mt-8 text-4xl font-black leading-tight sm:text-6xl">ภารกิจพิชิต<span className="block text-red-500">ภัยไซเบอร์</span></h1>
              <p className="mt-5 max-w-xl leading-8 text-gray-300">บอร์ดเกมออนไลน์เรียนรู้ความปลอดภัยทางไซเบอร์ พร้อม 10 บทเรียนอัดแน่น!</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => setScreen("create")} className="rounded-xl bg-red-600 px-6 py-4 font-bold shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:bg-red-500">⚔️ สร้างห้องเกม</button>
                <button onClick={() => setScreen("join")} className="rounded-xl border border-red-700 px-6 py-4 font-bold hover:bg-red-950">🚪 เข้าร่วมห้อง</button>
                <button onClick={() => setScreen("lessons")} className="rounded-xl border border-yellow-600 bg-yellow-950/40 px-6 py-4 font-bold text-yellow-300 hover:bg-yellow-900/50">📚 บทเรียนทั้ง 10 บท</button>
              </div>
              <button onClick={() => setScreen("how")} className="mt-5 text-sm text-gray-400 underline underline-offset-4 hover:text-white">อ่านวิธีเล่น →</button>
            </div>

            {/* รูปหน้าแรกแสดงแบบถาวร */}
            <div className="rounded-3xl border-2 border-red-700 bg-gradient-to-b from-[#2a080c] via-[#120406] to-black p-6 shadow-[0_0_50px_rgba(185,28,28,0.4)]">
              <div className="relative overflow-hidden rounded-2xl border-2 border-red-600 bg-black shadow-[0_0_30px_rgba(220,38,38,0.4)]">
                <img src="/students.png" alt="Cyber Guardian Students" className="h-72 w-full object-cover object-top sm:h-80" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[["❓", "SITUATION", "การ์ดคำถาม"], ["💡", "KNOWLEDGE", "การ์ดความรู้"], ["🎯", "MISSION", "ภารกิจออนไลน์"], ["⚡", "SPECIAL", "เหตุการณ์พิเศษ"]].map(([i, e, t]) => (
                  <div key={e} className="rounded-xl border border-red-900/80 bg-black/80 p-3 text-center"><div className="text-2xl">{i}</div><div className="mt-1 text-[10px] font-black text-red-400">{e}</div><div className="text-xs font-bold text-gray-200">{t}</div></div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Create & Join Screens */}
      {screen === "create" && (
        <section className="mx-auto max-w-xl px-5 py-12">
          <button onClick={() => setScreen("home")} className="mb-6 text-red-400">← กลับหน้าหลัก</button>
          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <h1 className="text-3xl font-black">สร้างห้องเกม</h1>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="กรอกชื่อเล่นของคุณ" maxLength={24} className="mt-6 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 outline-none focus:border-red-500" />
            <button onClick={createRoom} disabled={busy} className="mt-6 w-full rounded-xl bg-red-600 px-5 py-4 font-bold hover:bg-red-500">{busy ? "กำลังสร้างห้อง..." : "⚔️ สร้างห้องออนไลน์"}</button>
            {message && <p className="mt-4 text-sm text-yellow-200">{message}</p>}
          </div>
        </section>
      )}

      {screen === "join" && (
        <section className="mx-auto max-w-xl px-5 py-12">
          <button onClick={() => setScreen("home")} className="mb-6 text-red-400">← กลับหน้าหลัก</button>
          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <h1 className="text-3xl font-black">เข้าร่วมห้องเกม</h1>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="กรอกชื่อเล่นของคุณ" maxLength={24} className="mt-6 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 outline-none focus:border-red-500" />
            <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="รหัสห้อง 6 หลัก" maxLength={6} className="mt-4 w-full rounded-xl border border-gray-700 bg-black px-4 py-3 uppercase outline-none focus:border-red-500" />
            <button onClick={joinRoom} disabled={busy} className="mt-6 w-full rounded-xl bg-red-600 px-5 py-4 font-bold hover:bg-red-500">{busy ? "เข้าสู่ห้อง..." : "🚪 เข้าสู่ห้องออนไลน์"}</button>
            {message && <p className="mt-4 text-sm text-yellow-200">{message}</p>}
          </div>
        </section>
      )}

      {/* LOBBY & BOARD */}
      {screen === "room" && room && (
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          
          {/* Modal กิจกรรมช่อง */}
          {activeTileModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
              <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border-2 border-red-500 bg-gradient-to-b from-[#1f080b] to-black p-6 shadow-[0_0_60px_rgba(220,38,38,0.6)]">
                <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-black text-red-200">ช่องที่ {activeTileModal.cell} • +{activeTileModal.points} POINTS</span>
                <h3 className="mt-4 text-2xl font-black text-white">{activeTileModal.icon} {activeTileModal.cardTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-200">{activeTileModal.description}</p>
                {activeTileModal.knowledgeTip && <div className="mt-4 rounded-xl border border-emerald-600 bg-emerald-950/30 p-4"><p className="text-xs font-black text-emerald-300">💡 KNOWLEDGE TIP:</p><p className="mt-2 text-sm text-white">{activeTileModal.knowledgeTip}</p></div>}
                
                {activeTileModal.options && activeTileModal.options.length > 0 && (
                  <div className="mt-5 space-y-2.5">
                    {activeTileModal.options.map((opt, idx) => (
                      <button key={idx} onClick={() => completeTileActivity(idx)} disabled={tileCompleted} className={`w-full rounded-xl border p-3.5 text-left text-sm font-bold ${tileCompleted ? (idx === activeTileModal.correctIndex ? "border-green-400 bg-green-900" : tileOptionSelected===idx ? "border-red-500 bg-red-900" : "bg-black opacity-50") : "bg-black hover:border-red-500"}`}>{idx+1}. {opt}</button>
                    ))}
                  </div>
                )}
                {(!activeTileModal.options || activeTileModal.options.length === 0) && !tileCompleted && (
                  <button onClick={() => completeTileActivity()} className="mt-5 w-full rounded-xl bg-red-600 py-3.5 font-black hover:bg-red-500">✅ รับทราบและรับคะแนน!</button>
                )}
                {tileCompleted && <div className="mt-5 rounded-xl border border-yellow-600 bg-yellow-900/40 p-4 text-sm text-yellow-200"><p className="font-black">{(activeTileModal.options && tileOptionSelected === activeTileModal.correctIndex) || !activeTileModal.options ? "🎉 ถูกต้อง!" : "⚠️ ตอบผิด!"}</p><p className="mt-1">{activeTileModal.explanation}</p></div>}
                <button onClick={() => setActiveTileModal(null)} className="mt-5 w-full rounded-xl border border-gray-700 bg-black py-3 text-sm font-bold text-gray-300 hover:border-white">ปิดหน้าต่างการ์ด</button>
              </div>
            </div>
          )}

          {/* พรีวิวกองการ์ดบนกระดานตรงกลาง */}
          {previewDeckCategory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border-2 border-red-600 bg-[#13090c] p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-red-400">🗂️ รายการการ์ดในกอง</h3>
                  <button onClick={() => setPreviewDeckCategory(null)} className="rounded-lg bg-red-900 px-3 py-1 text-xs font-bold hover:bg-red-700">✖ ปิด</button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {BOARD_TILES_DATA.filter((t) => t.category === previewDeckCategory).map((card) => (
                    <div key={card.cell} className="rounded-xl border border-red-900/70 bg-black p-3.5">
                      <span className="text-[10px] font-bold text-red-400">ช่องที่ {card.cell} • +{card.points} แต้ม</span>
                      <p className="mt-1 text-sm font-bold text-white">{card.icon} {card.cardTitle}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LOBBY CENTER (ด้านบนกระดาน) */}
          <div className="rounded-3xl border-2 border-red-800 bg-gradient-to-br from-[#1c070a] via-[#11080b] to-black p-5 shadow-[0_0_40px_rgba(153,27,27,0.3)] sm:p-7">
            <div className="grid items-center gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="relative overflow-hidden rounded-2xl border-2 border-red-600 bg-black shadow-[0_0_30px_rgba(220,38,38,0.4)]">
                  <img src="/students.png" alt="Cyber Guardian Lobby" className="h-64 w-full object-cover object-top sm:h-72" />
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="rounded-full border border-red-700 bg-red-950/80 px-3 py-1 text-xs font-bold text-red-300">● LOBBY CENTER</span>
                    <h1 className="mt-2 text-2xl font-black sm:text-3xl">ล็อบบี้ภารกิจ CYBER GUARDIAN</h1>
                  </div>
                  <div className="rounded-2xl border-2 border-red-600 bg-black px-5 py-3 text-center">
                    <p className="text-[10px] font-bold text-gray-400">ROOM CODE</p>
                    <p className="text-3xl font-black tracking-widest text-red-500">{room.room_code}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => { navigator.clipboard.writeText(room.room_code); setMessage("คัดลอกรหัสแล้ว!"); }} className="rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm font-bold hover:bg-red-900">📋 คัดลอกรหัสห้อง</button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2">
                  {players.map((player, index) => {
                    const avatar = PLAYER_AVATARS[index % PLAYER_AVATARS.length];
                    return (
                      <div key={player.id} className="flex items-center gap-3 rounded-xl border border-red-900/80 bg-black px-3.5 py-2.5">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-blue-300 to-blue-500 text-xl shadow">{avatar}</span>
                        <div>
                          <p className="text-sm font-bold">{player.player_name} {player.user_id === room.host_id && "👑"}</p>
                          <p className="text-[11px] text-gray-400">ช่อง: <strong className="text-white">{room.game_state?.positions?.[player.user_id] ?? 0}</strong> • คะแนน: <span className="text-yellow-400 font-bold">{room.game_state?.scores?.[player.user_id] ?? 0}</span></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ==================== กระดานบอร์ดเกม ==================== */}
          <div className="mt-8 rounded-[32px] border-4 border-red-700 bg-[#0b0507] p-4 shadow-[0_0_70px_rgba(185,28,28,0.45)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-red-800 bg-black p-4">
              <div><span className="text-xs font-black text-red-400">CYBER GUARDIAN BOARD</span><h2 className="mt-1 text-xl font-black">🎲 กระดานพิชิตภัยไซเบอร์</h2></div>
              <div className="flex items-center gap-3">
                {room.status === "waiting" && room.host_id === userId && <button onClick={startGame} disabled={busy || players.length < 2} className="rounded-xl bg-red-600 px-6 py-3 font-black shadow-lg hover:bg-red-500">🚀 เริ่มเกมเลย!</button>}
                {room.status === "playing" && (
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-red-700 bg-black px-4 py-2 text-right hidden sm:block">
                      <p className="text-[10px] text-gray-400">ถึงตาของ</p>
                      <p className="text-sm font-black text-yellow-300">{players.find((p) => p.user_id === room.game_state?.turn_order?.[room.game_state.current_turn_index])?.player_name ?? "..."}</p>
                    </div>
                    {room.game_state?.last_roll != null && (
                      <div className="rounded-xl border border-yellow-600 bg-yellow-950/40 px-3.5 py-2 text-center">
                        <p className="text-[10px] text-yellow-200">เต๋าล่าสุด</p>
                        <p className="text-lg font-black text-yellow-400">🎲 {room.game_state.last_roll}</p>
                      </div>
                    )}
                    <button onClick={rollDice} disabled={busy || isAnimating || room.game_state?.turn_order?.[room.game_state.current_turn_index] !== userId} className="rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-7 py-4 text-base font-black shadow-[0_0_20px_rgba(239,68,68,0.7)] hover:scale-105 disabled:opacity-40 transition-transform">
                      {isAnimating ? "กำลังเดิน..." : busy ? "กำลังทอย..." : "🎲 ทอยลูกเต๋า"}
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {message && <div className="mt-4 rounded-xl border border-yellow-600 bg-yellow-950/50 p-3 text-center text-sm font-bold text-yellow-200">{message}</div>}

            {/* แสดงผลผู้ชนะตัวจริง */}
            {room.status === "finished" && (
              <div className="mt-6 rounded-3xl border-2 border-yellow-500 bg-gradient-to-b from-[#3a2005] to-black p-8 text-center shadow-[0_0_50px_rgba(234,179,8,0.4)]">
                <p className="text-6xl drop-shadow-[0_0_25px_rgba(250,204,21,1)]">🏆</p>
                <h3 className="mt-4 text-3xl font-black text-yellow-300">ภารกิจเสร็จสิ้น!</h3>
                <p className="mt-2 text-sm text-gray-300">มีผู้พิทักษ์เดินทางถึงช่องที่ 30 แล้ว</p>
                <div className="mt-6 mx-auto inline-block rounded-2xl border border-yellow-500/50 bg-black/80 px-8 py-5 shadow-2xl">
                  <p className="text-xs font-bold text-gray-400">👑 ผู้ชนะที่แท้จริง (แต้มความรู้สูงสุด)</p>
                  <p className="mt-2 text-4xl font-black text-yellow-400 drop-shadow-md">
                    {players.find((player) => player.user_id === room.game_state?.winner_id)?.player_name ?? "กำลังประมวลผล..."}
                  </p>
                  <p className="mt-2 text-xs font-bold text-yellow-200/80">ได้รับตำแหน่ง THE TRUE CYBER GUARDIAN</p>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border-2 border-red-600 bg-[#140508] p-4"><h3 className="text-white font-black mb-3">1. DIGITAL IDENTITY</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="flex min-h-[95px] flex-col justify-between rounded-2xl border-2 border-white bg-gradient-to-br from-red-700 to-black p-2 shadow-lg"><span className="w-fit rounded bg-white px-1.5 py-0.5 text-[10px] font-black text-black">START</span><p className="text-xs font-black text-white">จุดปล่อยตัว</p><div className="flex flex-wrap gap-1">{players.filter(p => (localPos[p.user_id] ?? 0) === 0).map(p => { const avatar = PLAYER_AVATARS[players.findIndex(x => x.id === p.id) % PLAYER_AVATARS.length]; return <span key={p.id} title={p.player_name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-b from-blue-300 to-blue-500 text-lg shadow-md hover:scale-110 transition-transform">{avatar}</span>; })}</div></div>
                {BOARD_TILES_DATA.filter(t => t.zone === 1).map(renderBoardTile)}
              </div></div>
              <div className="rounded-3xl border-2 border-red-600 bg-[#140508] p-4"><h3 className="text-white font-black mb-3">2. PHISHING ATTACK</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{BOARD_TILES_DATA.filter(t => t.zone === 2).map(renderBoardTile)}</div></div>
            </div>

            <div className="my-6 grid items-center gap-4 rounded-3xl border-2 border-red-800 bg-[radial-gradient(circle_at_center,#3b070c_0%,#090507_70%)] p-5 lg:grid-cols-12">
              <div className="grid grid-cols-2 gap-3 lg:col-span-4">
                <button type="button" onClick={() => setPreviewDeckCategory("question")} className="group flex h-36 flex-col items-center justify-center rounded-2xl border-2 border-gray-400 bg-gradient-to-b from-[#1a1a22] to-black p-3 text-center shadow-lg transition hover:-translate-y-1 hover:border-red-500"><span className="text-2xl">❓</span><span className="mt-2 text-xs font-black tracking-wider text-white">SITUATION CARDS</span><span className="mt-1 text-[11px] font-bold text-red-400">(การ์ดคำถาม)</span></button>
                <button type="button" onClick={() => setPreviewDeckCategory("knowledge")} className="group flex h-36 flex-col items-center justify-center rounded-2xl border-2 border-red-500 bg-gradient-to-b from-red-900/80 to-black p-3 text-center shadow-lg transition hover:-translate-y-1 hover:border-white"><span className="text-2xl">💡</span><span className="mt-2 text-xs font-black tracking-wider text-white">KNOWLEDGE CARDS</span><span className="mt-1 text-[11px] font-bold text-red-200">(การ์ดความรู้)</span></button>
              </div>
              <div className="flex flex-col items-center justify-center lg:col-span-4">
                <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full border-4 border-red-600 bg-gradient-to-b from-black via-[#2a060a] to-black p-4 text-center shadow-[0_0_45px_rgba(220,38,38,0.75)] ring-4 ring-red-950"><span className="text-3xl">🛡️</span><span className="mt-1 text-xl font-black tracking-wider text-white">CYBER</span><span className="text-base font-black tracking-widest text-red-500">GUARDIAN</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:col-span-4">
                <button type="button" onClick={() => setPreviewDeckCategory("mission")} className="group flex h-36 flex-col items-center justify-center rounded-2xl border-2 border-amber-500 bg-gradient-to-b from-[#291505] to-black p-3 text-center shadow-lg transition hover:-translate-y-1 hover:border-white"><span className="text-2xl">🎯</span><span className="mt-2 text-xs font-black tracking-wider text-white">ONLINE MISSION</span><span className="mt-1 text-[11px] font-bold text-amber-400">(ภารกิจออนไลน์)</span></button>
                <button type="button" onClick={() => setPreviewDeckCategory("special")} className="group flex h-36 flex-col items-center justify-center rounded-2xl border-2 border-gray-400 bg-gradient-to-b from-[#1a1a22] to-black p-3 text-center shadow-lg transition hover:-translate-y-1 hover:border-red-500"><span className="text-2xl">⚡</span><span className="mt-2 text-xs font-black tracking-wider text-white">SPECIAL EVENT</span><span className="mt-1 text-[11px] font-bold text-purple-300">(การ์ดพิเศษ)</span></button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border-2 border-red-600 bg-[#140508] p-4"><h3 className="text-white font-black mb-3">3. MALWARE PROTECTION</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{BOARD_TILES_DATA.filter(t => t.zone === 3).map(renderBoardTile)}</div></div>
              <div className="rounded-3xl border-2 border-red-600 bg-[#140508] p-4"><h3 className="text-white font-black mb-3">4. PRIVACY & CYBER MISSION</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{BOARD_TILES_DATA.filter(t => t.zone === 4).map(renderBoardTile)}</div></div>
            </div>

            {/* SCORE TRACK */}
            <div className="mt-6 rounded-2xl border-2 border-red-700 bg-black p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black tracking-widest text-red-400">📊 SCORE TRACK / POINTS (แถบคะแนน)</span>
                <span className="text-xs text-gray-400">ผู้ชนะคือคนที่มีแต้มรวมมากที่สุดเมื่อเกมจบ!</span>
              </div>
              <div className="mt-3 grid grid-cols-10 gap-1 sm:grid-cols-16">
                {Array.from({ length: 16 }, (_, idx) => {
                  const pt = idx * 10;
                  return <div key={pt} className={`rounded border py-1.5 text-center font-mono text-[11px] font-black ${idx % 2 === 0 ? "border-red-700 bg-red-700 text-white" : "border-red-900 bg-[#1a090d] text-red-200"}`}>{pt}</div>;
                })}
              </div>
            </div>
          </div>
          
          <button onClick={leaveRoom} className="mt-6 w-full rounded-xl border border-red-700 bg-black py-4 font-bold text-red-300 hover:bg-red-950">ออกจากห้อง</button>
        </section>
      )}

      {/* บทเรียน 10 บท + วิดีโอสอน */}
      {screen === "lessons" && (
        <section className="mx-auto max-w-7xl px-5 py-10">
          
          {showLessonTutorial && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
              <div className="w-full max-w-3xl rounded-3xl border-2 border-blue-500 bg-black p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black text-blue-400">▶️ วิดีโอแนะนำบทเรียน</h3>
                  <button onClick={() => setShowLessonTutorial(false)} className="rounded-lg bg-red-900 px-3 py-1 text-xs font-bold hover:bg-red-700">✖ ปิด</button>
                </div>
                <video src="/ความปลอดภัยทางไซเบอร์.MP4" controls autoPlay muted playsInline className="w-full rounded-xl border border-gray-800 bg-black shadow-lg" />
                <p className="mt-4 text-sm text-gray-300 text-center">วิดีโอสอนการใช้งานฟีเจอร์บทเรียนไซเบอร์เบื้องต้น</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 mb-8 border-b border-gray-800 pb-4">
            <button onClick={() => setScreen("home")} className="text-sm font-bold text-red-400 hover:text-white">← กลับหน้าหลัก</button>
            <button onClick={() => setShowLessonTutorial(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold shadow-lg hover:bg-blue-500">
               🎥 วิดีโอแนะนำบทเรียน
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-3">
              {CYBER_LESSONS_DATA.map(lesson => (
                <button key={lesson.id} onClick={() => selectLesson(lesson)} className={`w-full rounded-2xl border p-4 text-left transition ${activeLesson.id === lesson.id ? "border-red-500 bg-red-950/60" : "border-gray-800 bg-[#121216] hover:border-red-800"}`}>
                  <span className="text-[10px] font-bold text-red-400">
                    MISSION {lesson.missionCode} • {lesson.type === "image" ? "🖼️ ภาพจำลอง" : "🎬 วิดีโอจำลอง"}
                  </span>
                  <h3 className="mt-1 font-bold">{lesson.icon} {lesson.title}</h3>
                </button>
              ))}
            </div>

            <div className="lg:col-span-8">
              <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
                <h1 className="text-2xl font-black sm:text-3xl">{activeLesson.icon} {activeLesson.title}</h1>
                <p className="mt-3 leading-7 text-gray-300">{activeLesson.detail}</p>

                {/* ภาพจำลอง (Mockup) */}
                {activeLesson.type === "image" && activeLesson.mockup && (
                  <div className="mt-6 rounded-2xl border border-red-800 bg-black p-5">
                    <h3 className="text-lg font-black text-red-400">{activeLesson.mockup.header}</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-red-700/80 bg-red-950/20 p-4">
                        <h4 className="font-bold text-red-400">{activeLesson.mockup.badExampleTitle}</h4>
                        <ul className="mt-2 space-y-2 text-xs text-gray-200">
                          {activeLesson.mockup.badExampleItems.map((item, idx) => (<li key={idx} className="rounded bg-black/70 p-2">{item}</li>))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-green-700/80 bg-green-950/20 p-4">
                        <h4 className="font-bold text-green-400">{activeLesson.mockup.goodExampleTitle}</h4>
                        <ul className="mt-2 space-y-2 text-xs text-gray-200">
                          {activeLesson.mockup.goodExampleItems.map((item, idx) => (<li key={idx} className="rounded bg-black/70 p-2">{item}</li>))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* วิดีโอจำลอง (Scenes) */}
                {activeLesson.type === "video" && activeLesson.scenes && (
                  <div className="mt-6 rounded-2xl border border-red-700 bg-black p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-400">🎬 วิดีโอจำลองสถานการณ์ (ฉากที่ {currentSceneIndex + 1}/{activeLesson.scenes.length})</span>
                      <button onClick={() => setIsPlayingVideoSim((prev) => !prev)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold">
                        {isPlayingVideoSim ? "⏸️ หยุด" : "▶️ เล่นอัตโนมัติ"}
                      </button>
                    </div>
                    <div className={`mt-4 rounded-xl border p-4 font-mono text-sm ${activeLesson.scenes[currentSceneIndex]?.alertLevel === "danger" ? "bg-red-950 border-red-500" : activeLesson.scenes[currentSceneIndex]?.alertLevel === "warning" ? "bg-yellow-950 border-yellow-500" : "bg-green-950 border-green-500"}`}>
                      {activeLesson.scenes[currentSceneIndex]?.screenText}
                    </div>
                    <p className="mt-3 text-sm text-gray-300">{activeLesson.scenes[currentSceneIndex]?.narration}</p>
                    
                    <div className="mt-4 flex gap-1 justify-center">
                      {activeLesson.scenes.map((_, idx) => (
                        <button key={idx} onClick={() => { setIsPlayingVideoSim(false); setCurrentSceneIndex(idx); }} className={`h-2 w-8 rounded-full ${idx === currentSceneIndex ? "bg-red-500" : "bg-gray-700"}`} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ควิซท้ายบท */}
                <div className="mt-6 rounded-2xl border border-red-900 bg-black p-5">
                  <p className="text-xs font-bold text-red-400">🎯 ทดสอบความเข้าใจประจำบทเรียน</p>
                  <h4 className="mt-2 font-bold">{activeLesson.quiz.question}</h4>
                  <div className="mt-4 space-y-2.5">
                    {activeLesson.quiz.options.map((opt, idx) => {
                      const isPicked = lessonQuizAnswer === idx;
                      const isRight = idx === activeLesson.quiz.correctIndex;
                      return (
                        <button key={idx} onClick={() => setLessonQuizAnswer(idx)} className={`w-full rounded-xl border p-3.5 text-left text-sm transition ${lessonQuizAnswer !== null ? (isRight ? "border-green-500 bg-green-900" : isPicked ? "border-red-500 bg-red-900" : "border-gray-800 bg-black opacity-50") : "border-gray-800 bg-[#121216] hover:border-red-600"}`}>
                          {idx + 1}. {opt}
                        </button>
                      );
                    })}
                  </div>
                  {lessonQuizAnswer !== null && (
                    <div className="mt-4 rounded-xl border border-yellow-700 bg-yellow-950/30 p-4 text-sm text-yellow-200">
                      💡 <strong>เฉลย:</strong> {activeLesson.quiz.explanation}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </section>
      )}

      {/* หน้าวิธีเล่น */}
      {screen === "how" && (
        <section className="mx-auto max-w-2xl px-5 py-12">
          <button onClick={() => { setScreen("home"); setMessage(""); }} className="mb-6 text-red-400">← กลับหน้าหลัก</button>
          <div className="rounded-3xl border border-red-900 bg-[#141014] p-6 sm:p-8">
            <h1 className="text-3xl font-black">วิธีเล่น CYBER GUARDIAN</h1>
            <div className="mt-6 space-y-3">
              {["สร้างห้องหรือเข้าร่วมห้องล็อบบี้พร้อมเพื่อน (2-4 คน)", "ผลัดกันทอยลูกเต๋าเดินผ่าน 4 โซนภารกิจบนกระดาน 30 ช่อง", "ทอยลูกเต๋าแล้วตัวการ์ตูนจะเดินไปทีละช่องจนถึงเป้าหมาย แล้วการ์ดกิจกรรมจะเด้งขึ้นมา", "ทำภารกิจและตอบคำถามเพื่อสะสมแต้มให้มากที่สุด และเดินถึงช่อง 30!"].map((item, i) => (
                <div key={item} className="flex items-center gap-4 rounded-xl border border-gray-800 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-700 font-black">{i + 1}</span><p>{item}</p></div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-gray-800 px-5 py-8 text-center">
        <p className="font-black tracking-widest">CYBER <span className="text-red-500">GUARDIAN</span></p>
        <p className="mt-2 text-xs text-gray-500">เรียนรู้ • คิดวิเคราะห์ • ป้องกันภัยในโลกดิจิทัล</p>
      </footer>
    </main>
  );
}