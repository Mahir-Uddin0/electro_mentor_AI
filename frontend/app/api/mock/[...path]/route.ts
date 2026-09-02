import { NextRequest, NextResponse } from "next/server";

type MockMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources?: Array<{ title: string }>;
};

type MockConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  message_count: number;
  messages: MockMessage[];
};

const mockGlobal = globalThis as typeof globalThis & {
  __electroMentorConversations?: Map<string, MockConversation>;
};

function makeSeedConversation(
  id: string,
  title: string,
  question: string,
  answer: string,
  createdAt: string,
): MockConversation {
  const messages: MockMessage[] = [
    { id: `${id}-user`, conversation_id: id, role: "user", content: question, created_at: createdAt },
    {
      id: `${id}-assistant`,
      conversation_id: id,
      role: "assistant",
      content: answer,
      created_at: createdAt,
      sources: [{ title: "Electrical workshop safety guide" }],
    },
  ];
  return {
    id,
    title,
    created_at: createdAt,
    updated_at: createdAt,
    last_message: answer,
    message_count: messages.length,
    messages,
  };
}

function getConversationStore() {
  if (!mockGlobal.__electroMentorConversations) {
    const seeds = [
      makeSeedConversation(
        "mock-motor-starter",
        "Motor starter troubleshooting",
        "Why does my MCB trip when the motor starts?",
        "A motor can briefly draw several times its rated current at startup. First isolate the supply, then check the MCB curve and rating, loose terminals, overload setting, cable size, and whether the motor is mechanically jammed.",
        "2026-08-24T08:30:00.000Z",
      ),
      makeSeedConversation(
        "mock-house-wiring",
        "House wiring safety",
        "What should I check before installing a socket?",
        "Confirm the circuit is isolated and proved dead, verify conductor size and protective-device rating, identify line/neutral/earth correctly, inspect the enclosure, and test continuity, polarity, insulation resistance, and RCD operation before energizing.",
        "2026-08-23T11:15:00.000Z",
      ),
      makeSeedConversation(
        "mock-rccb-testing",
        "Testing an RCCB",
        "Show me the correct RCCB testing sequence.",
        "Start with the manufacturer test button, then use a calibrated RCD tester at the required current and phase settings. Record trip times and compare them with the applicable standard. Only trained persons should perform live tests.",
        "2026-08-21T09:00:00.000Z",
      ),
    ];
    mockGlobal.__electroMentorConversations = new Map(
      seeds.map((conversation) => [conversation.id, conversation]),
    );
  }
  return mockGlobal.__electroMentorConversations;
}

function summary(conversation: MockConversation) {
  const { messages: _messages, ...conversationSummary } = conversation;
  return conversationSummary;
}

function titleFromMessage(message: string) {
  const words = message.trim().split(/\s+/).slice(0, 7).join(" ");
  return words.length < message.trim().length ? `${words}…` : words;
}

function usesBangla(request: NextRequest) {
  return request.headers.get("accept-language")?.toLowerCase().startsWith("bn") ?? false;
}

function mockText(bangla: boolean, english: string, bengali: string) {
  return bangla ? bengali : english;
}

function mockAssistantAnswer(message: string, bangla: boolean) {
  if (bangla) {
    return `“${message}” সম্পর্কে কাজ শুরুর আগে প্রধান বিদ্যুৎ সরবরাহ বিচ্ছিন্ন করুন এবং সার্কিটে বিদ্যুৎ নেই তা যাচাই করুন। ওয়্যারিং গাইড অনুযায়ী সুরক্ষা যন্ত্র, কেবলের আকার, টার্মিনাল সংযোগ, আর্থিং ও সংযুক্ত লোড পরীক্ষা করুন। বাস্তব ব্যাকএন্ডের উত্তরের মতো এই প্রিভিউ উত্তরটিও মক কথোপকথনে সংরক্ষিত হয়েছে।`;
  }
  return `For “${message}”, begin by isolating the supply and verifying that the circuit is de-energized. Inspect the protective device, cable sizing, terminations, earthing, and the connected load against the wiring guide. This preview answer is stored in the mock conversation just like a real backend response.`;
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const segments = (await params).path;
  const path = segments.join("/");
  const bangla = usesBangla(request);
  const responses: Record<string, object> = {
    dashboard: { greeting: "Welcome back, Prince!" },
    guides: { total: 24 },
    tasks: { total: 4, completed: 1 },
  };

  if (path === "conversations") {
    const conversations = [...getConversationStore().values()]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(summary);
    return NextResponse.json({ conversations });
  }

  if (segments[0] === "conversations" && segments.length === 2) {
    const conversation = getConversationStore().get(segments[1]);
    if (!conversation) {
      return NextResponse.json(
        { detail: mockText(bangla, "Conversation not found.", "কথোপকথনটি পাওয়া যায়নি।") },
        { status: 404 },
      );
    }
    return NextResponse.json(conversation);
  }

  return NextResponse.json(responses[path] ?? { ok: true, path });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const segments = (await params).path;
  const path = segments.join("/");
  const bangla = usesBangla(request);

  if (path === "photo-analysis") {
    const formData = await request.formData().catch(() => null);
    const image = formData?.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          detail: mockText(
            bangla,
            "Upload an image in the 'image' field.",
            "'image' ফিল্ডে একটি ছবি আপলোড করুন।",
          ),
        },
        { status: 422 },
      );
    }
    return NextResponse.json({
      analysis_id: `AN-${crypto.randomUUID().slice(0, 8)}`,
      status: "completed",
      outcome: "faults_detected",
      summary: mockText(
        bangla,
        "The preview analyzer found a potentially loose terminal connection that should be checked after the circuit is safely isolated.",
        "প্রিভিউ বিশ্লেষণে একটি সম্ভাব্য ঢিলা টার্মিনাল সংযোগ পাওয়া গেছে। সার্কিট নিরাপদে বিচ্ছিন্ন করার পর এটি পরীক্ষা করা উচিত।",
      ),
      primary_fault: {
        title: mockText(bangla, "Possible loose terminal connection", "সম্ভাব্য ঢিলা টার্মিনাল সংযোগ"),
        description: mockText(
          bangla,
          "A conductor appears incompletely seated at a visible terminal.",
          "দৃশ্যমান একটি টার্মিনালে পরিবাহীটি সম্পূর্ণভাবে বসানো হয়নি বলে মনে হচ্ছে।",
        ),
        severity: "high",
        confidence: 91,
        location: mockText(bangla, "Visible terminal block", "দৃশ্যমান টার্মিনাল ব্লক"),
        possible_cause: mockText(
          bangla,
          "The terminal may not have been tightened correctly or may have loosened after thermal cycling.",
          "টার্মিনালটি সঠিকভাবে আঁটা হয়নি অথবা বারবার গরম ও ঠান্ডা হওয়ার কারণে ঢিলা হয়ে যেতে পারে।",
        ),
        repair_steps: bangla
          ? [
              "উৎস থেকে সার্কিট বিচ্ছিন্ন করে লকআউট/ট্যাগআউট করুন।",
              "অনুমোদিত টেস্টার দিয়ে সার্কিটে বিদ্যুৎ নেই তা নিশ্চিত করুন।",
              "যোগ্য ইলেকট্রিশিয়ান দিয়ে পরিবাহীটি পরীক্ষা ও সঠিকভাবে সংযুক্ত করান।",
            ]
          : [
              "Isolate the circuit at its source and apply lockout/tagout.",
              "Prove the circuit is de-energized with an approved tester.",
              "Ask a qualified electrician to inspect and correctly terminate the conductor.",
            ],
        safety_warning: mockText(
          bangla,
          "Do not touch or tighten visible conductors while the circuit may be energized.",
          "সার্কিটে বিদ্যুৎ থাকার সম্ভাবনা থাকলে দৃশ্যমান পরিবাহী স্পর্শ বা আঁটবেন না।",
        ),
        required_ppe: bangla
          ? ["ইনসুলেটেড গ্লাভস", "নিরাপত্তা চশমা"]
          : ["Insulated gloves", "Safety goggles"],
        required_tools: bangla
          ? ["অনুমোদিত ভোল্টেজ টেস্টার", "টর্ক স্ক্রু-ড্রাইভার"]
          : ["Approved voltage tester", "Torque screwdriver"],
        estimated_repair_time: mockText(
          bangla,
          "15–30 minutes after safe isolation",
          "নিরাপদে বিচ্ছিন্ন করার পর ১৫–৩০ মিনিট",
        ),
      },
      other_faults: [],
      upload_guidance: {
        reason: null,
        recommended_photos: [],
        photo_tips: [
          mockText(
            bangla,
            "Include a wider view showing the enclosure and cable routing.",
            "এনক্লোজার ও কেবল চলাচলের পথসহ আরও বিস্তৃত দৃশ্যের ছবি দিন।",
          ),
        ],
      },
      analyzed_at: new Date().toISOString(),
    });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (path === "conversations") {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const suppliedTitle = typeof body.title === "string" ? body.title.trim() : "";
    const conversation: MockConversation = {
      id,
      title: suppliedTitle || "New conversation",
      created_at: now,
      updated_at: now,
      last_message: null,
      message_count: 0,
      messages: [],
    };
    getConversationStore().set(id, conversation);
    return NextResponse.json(summary(conversation), { status: 201 });
  }

  if (segments[0] === "conversations" && segments.length === 3 && segments[2] === "messages") {
    const conversation = getConversationStore().get(segments[1]);
    if (!conversation) {
      return NextResponse.json(
        { detail: mockText(bangla, "Conversation not found.", "কথোপকথনটি পাওয়া যায়নি।") },
        { status: 404 },
      );
    }
    const content = typeof body.message === "string" ? body.message.trim() : "";
    if (!content) {
      return NextResponse.json(
        { detail: mockText(bangla, "Message cannot be empty.", "বার্তা খালি রাখা যাবে না।") },
        { status: 422 },
      );
    }

    const createdAt = new Date().toISOString();
    const userMessage: MockMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: "user",
      content,
      created_at: createdAt,
    };
    const sources = [{
      title: mockText(
        bangla,
        "Electrical workshop safety guide",
        "ইলেকট্রিক্যাল কর্মশালা নিরাপত্তা গাইড",
      ),
    }];
    const assistantMessage: MockMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: "assistant",
      content: mockAssistantAnswer(content, bangla),
      created_at: new Date().toISOString(),
      sources,
    };
    conversation.messages.push(userMessage, assistantMessage);
    conversation.updated_at = assistantMessage.created_at;
    conversation.last_message = assistantMessage.content;
    conversation.message_count = conversation.messages.length;
    if (conversation.title === "New conversation") conversation.title = titleFromMessage(content);

    return NextResponse.json({
      conversation_id: conversation.id,
      user_message: userMessage,
      assistant_message: assistantMessage,
      sources,
    });
  }

  if (path === "checklists/generate") {
    return NextResponse.json({
      id: "CHK-204",
      title:
        typeof body.task === "string"
          ? body.task
          : mockText(bangla, "Safety checklist", "নিরাপত্তা চেকলিস্ট"),
    });
  }
  return NextResponse.json({ ok: true, path, received: body });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const segments = (await params).path;
  const bangla = usesBangla(request);
  if (segments[0] !== "conversations" || segments.length !== 2) {
    return NextResponse.json(
      { detail: mockText(bangla, "Not found.", "পাওয়া যায়নি।") },
      { status: 404 },
    );
  }
  const conversation = getConversationStore().get(segments[1]);
  if (!conversation) {
    return NextResponse.json(
      { detail: mockText(bangla, "Conversation not found.", "কথোপকথনটি পাওয়া যায়নি।") },
      { status: 404 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      { detail: mockText(bangla, "Title cannot be empty.", "শিরোনাম খালি রাখা যাবে না।") },
      { status: 422 },
    );
  }
  conversation.title = title;
  conversation.updated_at = new Date().toISOString();
  return NextResponse.json(summary(conversation));
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const segments = (await params).path;
  const bangla = usesBangla(request);
  if (segments[0] !== "conversations" || segments.length !== 2) {
    return NextResponse.json(
      { detail: mockText(bangla, "Not found.", "পাওয়া যায়নি।") },
      { status: 404 },
    );
  }
  if (!getConversationStore().delete(segments[1])) {
    return NextResponse.json(
      { detail: mockText(bangla, "Conversation not found.", "কথোপকথনটি পাওয়া যায়নি।") },
      { status: 404 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
