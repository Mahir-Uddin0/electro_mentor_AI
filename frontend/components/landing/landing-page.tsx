"use client";

import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText,
  Languages,
  ListTodo,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Brand } from "@/components/brand";
import { useLanguage } from "@/components/language-provider";
import type { AppLanguage } from "@/lib/i18n";

import styles from "./landing-page.module.css";

type FeatureKind =
  | "assessment"
  | "assistant"
  | "photo"
  | "guides"
  | "safety"
  | "generator"
  | "tracker";

type FeatureCopy = {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  cta: string;
};

type LandingCopy = {
  nav: { features: string; workflow: string; safety: string };
  login: string;
  install: string;
  installed: string;
  installHelp: string;
  installDismissed: string;
  close: string;
  theme: string;
  language: string;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primary: string;
    secondary: string;
    badges: string[];
  };
  preview: {
    label: string;
    workspace: string;
    assistant: string;
    assistantQuestion: string;
    assistantText: string;
    assistantSource: string;
    photo: string;
    photoText: string;
    assessment: string;
    safety: string;
    toolUsage: string;
    workQuality: string;
    clear: string;
    review: string;
    observed: string;
    guide: string;
    guideTwo: string;
    guideThree: string;
    pages: string;
    checklist: string;
    safetyItems: string[];
    generated: string;
    generatorPrompt: string;
    steps: string;
    upcoming: string;
    progress: string;
    completed: string;
    taskA: string;
    taskB: string;
    taskC: string;
  };
  intro: { eyebrow: string; title: string; description: string };
  features: FeatureCopy[];
  safety: { eyebrow: string; title: string; description: string; note: string };
  workflow: {
    eyebrow: string;
    title: string;
    description: string;
    steps: { title: string; description: string }[];
  };
  final: { eyebrow: string; title: string; description: string; cta: string };
  footer: {
    description: string;
    quick: string;
    tools: string;
    overview: string;
    start: string;
    rights: string;
    safety: string;
    developed: string;
    powered: string;
    backToTop: string;
  };
};

const COPY: Record<AppLanguage, LandingCopy> = {
  en: {
    nav: { features: "Features", workflow: "How it works", safety: "Safety first" },
    login: "Log in",
    install: "Install app",
    installed: "App installed",
    installHelp: "Open your browser menu and choose Install app or Add to Home Screen.",
    installDismissed: "Installation was dismissed. You can try again whenever you are ready.",
    close: "Close message",
    theme: "Toggle dark mode",
    language: "Change language",
    hero: {
      eyebrow: "AI-powered electrical learning",
      title: "Build practical skills. Troubleshoot with confidence.",
      description:
        "ElectroMentor AI brings work assessment, guided troubleshooting, wiring-photo review, safety resources, and progress tracking into one bilingual learning workspace.",
      primary: "Start learning",
      secondary: "Explore features",
      badges: ["Bangla & English", "Safety-aware guidance", "Installable on your device"],
    },
    preview: {
      label: "PRODUCT PREVIEW",
      workspace: "Your electrical learning workspace",
      assistant: "AI Troubleshooting",
      assistantQuestion: "MCB trips when the load starts. What should I check?",
      assistantText: "A guided check for the circuit, one safe step at a time.",
      assistantSource: "IEC safety guide · 2 sources",
      photo: "Photo review",
      photoText: "Possible loose termination identified",
      assessment: "Latest work assessment",
      safety: "Safety procedures",
      toolUsage: "Tool usage",
      workQuality: "Work quality",
      clear: "Clear",
      review: "Review",
      observed: "Observed in upload",
      guide: "Circuit protection fundamentals",
      guideTwo: "House wiring fundamentals",
      guideThree: "Testing and verification",
      pages: "PDF guide · 18 pages",
      checklist: "Pre-work safety check",
      safetyItems: ["Power source isolated", "PPE inspected", "Test instrument verified", "Work area secured", "Permit confirmed"],
      generated: "Checklist ready",
      generatorPrompt: "Install and test a residential lighting circuit",
      steps: "8 steps",
      upcoming: "Upcoming",
      progress: "In progress",
      completed: "Completed",
      taskA: "Inspect distribution board",
      taskB: "Test lighting circuit",
      taskC: "Record continuity results",
    },
    intro: {
      eyebrow: "One connected toolkit",
      title: "Support for every stage of practical electrical learning",
      description:
        "Move from understanding a problem to carrying out safer work, documenting progress, and reviewing your practical performance.",
    },
    features: [
      {
        eyebrow: "01 · Practical work assessment",
        title: "Turn a work video into focused skill feedback",
        description:
          "Upload a video of your practical work. AI generates ten video-specific questions, drafts only the answers supported by the footage, and lets you complete or correct every response before evaluation.",
        points: [
          "Scores six fixed skill areas, including safety and work quality",
          "Provides structured improvement suggestions",
          "Keeps completed assessments in your personal history",
        ],
        cta: "Start an assessment",
      },
      {
        eyebrow: "02 · AI troubleshooting assistant",
        title: "Ask electrical questions and work through the problem",
        description:
          "Describe a symptom, fault, or confusing circuit behavior. The assistant combines your question with relevant guide material and recent conversation context to produce a clear response.",
        points: [
          "Conversational help in Bangla or English",
          "Relevant context retrieved from the technical library",
          "Separate conversations saved to your account",
        ],
        cta: "Ask the assistant",
      },
      {
        eyebrow: "03 · Wiring photo analyzer",
        title: "Review visible wiring concerns from a photo",
        description:
          "Submit a clear wiring image for structured visual analysis. The report highlights observable concerns, explains their possible impact, and recommends what to inspect next.",
        points: [
          "Clearly separates observations from assumptions",
          "Requests a better angle when the fault is not visible",
          "Keeps high-risk guidance cautious and action-oriented",
        ],
        cta: "Review a photo",
      },
      {
        eyebrow: "04 · Wiring and circuit guide library",
        title: "Keep trusted learning material close to the work",
        description:
          "Browse the PDF guides maintained by the platform. Find circuit explanations, wiring procedures, and reference material without relying on static cards in the browser.",
        points: [
          "Search and browse backend-managed guide metadata",
          "Open a PDF in the application",
          "Download a copy for later study",
        ],
        cta: "Browse the guides",
      },
      {
        eyebrow: "05 · Safety checklist library",
        title: "Prepare the job with practical safety references",
        description:
          "Use dedicated checklist PDFs before and during electrical work. Titles and file information come from the backend library, so the available resources stay current with the platform.",
        points: [
          "Quick access to job-relevant checklist documents",
          "Open and download options",
          "A consistent safety reference alongside every tool",
        ],
        cta: "Open safety checklists",
      },
      {
        eyebrow: "06 · AI checklist generation",
        title: "Create a checklist around the task you describe",
        description:
          "Explain the electrical activity you are planning and generate a structured checklist for preparation, execution, testing, and documentation.",
        points: [
          "Task-specific rather than one-size-fits-all",
          "Organized into practical stages",
          "Designed for review before work begins",
        ],
        cta: "Generate a checklist",
      },
      {
        eyebrow: "07 · Task tracker",
        title: "Keep practical work visible from plan to completion",
        description:
          "Create your own tasks, set priorities, and move work between Upcoming, In Progress, and Completed. Every task is stored for the signed-in user.",
        points: [
          "User-specific tasks stored in Supabase",
          "Priority-based sorting for active work",
          "Simple status changes that update the board immediately",
        ],
        cta: "Open task tracker",
      },
    ],
    safety: {
      eyebrow: "Safety is part of the workflow",
      title: "AI guidance supports judgment—it does not replace a qualified inspection.",
      description:
        "ElectroMentor is designed as a learning and decision-support tool. Isolate power, follow local regulations, use appropriate PPE, and involve a qualified professional whenever conditions are uncertain or hazardous.",
      note: "Never work on an energized circuit based only on an AI response or image analysis.",
    },
    workflow: {
      eyebrow: "How it works",
      title: "From sign-in to safer, more reflective practice",
      description: "Choose the tool that fits the job and keep your learning connected in one account.",
      steps: [
        { title: "Create your workspace", description: "Sign in securely with Supabase and choose Bangla or English." },
        { title: "Use the right tool", description: "Ask a question, upload work evidence, open a guide, or plan a task." },
        { title: "Review and improve", description: "Check evidence, follow safety controls, and retain your progress over time." },
      ],
    },
    final: {
      eyebrow: "Ready when the work begins",
      title: "Put practical learning, safety, and AI assistance in one place.",
      description: "Create an account or sign in to open your ElectroMentor workspace.",
      cta: "Open ElectroMentor",
    },
    footer: {
      description: "Practical electrical learning, safety, and troubleshooting guidance in Bangla and English.",
      quick: "Quick navigation",
      tools: "Product tools",
      overview: "Product overview",
      start: "Sign in & start",
      rights: "All rights reserved.",
      safety: "Use AI guidance with proper isolation, PPE, and qualified supervision.",
      developed: "Developed by",
      powered: "Powered by",
      backToTop: "Back to top",
    },
  },
  bn: {
    nav: { features: "ফিচারসমূহ", workflow: "যেভাবে কাজ করে", safety: "নিরাপত্তা" },
    login: "লগ ইন",
    install: "অ্যাপ ইনস্টল",
    installed: "অ্যাপ ইনস্টল করা আছে",
    installHelp: "ব্রাউজারের মেনু থেকে Install app অথবা Add to Home Screen নির্বাচন করুন।",
    installDismissed: "ইনস্টল বাতিল করা হয়েছে। প্রস্তুত হলে আবার চেষ্টা করতে পারেন।",
    close: "বার্তা বন্ধ করুন",
    theme: "ডার্ক মোড পরিবর্তন করুন",
    language: "ভাষা পরিবর্তন করুন",
    hero: {
      eyebrow: "এআই-ভিত্তিক ইলেকট্রিক্যাল শিক্ষা",
      title: "ব্যবহারিক দক্ষতা গড়ুন। আত্মবিশ্বাসের সঙ্গে ত্রুটি খুঁজুন।",
      description:
        "ElectroMentor AI একই দ্বিভাষিক প্ল্যাটফর্মে কাজের মূল্যায়ন, ধাপে ধাপে ট্রাবলশুটিং, ওয়্যারিং ছবির পর্যালোচনা, নিরাপত্তা রিসোর্স ও কাজের অগ্রগতি রাখে।",
      primary: "শেখা শুরু করুন",
      secondary: "ফিচারগুলো দেখুন",
      badges: ["বাংলা ও ইংরেজি", "নিরাপত্তা-সচেতন নির্দেশনা", "ডিভাইসে ইনস্টল করা যায়"],
    },
    preview: {
      label: "প্রোডাক্ট প্রিভিউ",
      workspace: "আপনার ইলেকট্রিক্যাল লার্নিং ওয়ার্কস্পেস",
      assistant: "এআই ট্রাবলশুটিং",
      assistantQuestion: "লোড চালু হলে এমসিবি ট্রিপ করে। কী পরীক্ষা করব?",
      assistantText: "সার্কিট পরীক্ষা করুন নিরাপদভাবে, একবারে একটি ধাপ।",
      assistantSource: "আইইসি নিরাপত্তা গাইড · ২টি সূত্র",
      photo: "ছবি পর্যালোচনা",
      photoText: "সম্ভাব্য ঢিলা টার্মিনেশন শনাক্ত হয়েছে",
      assessment: "সর্বশেষ কাজের মূল্যায়ন",
      safety: "নিরাপত্তা পদ্ধতি",
      toolUsage: "টুল ব্যবহার",
      workQuality: "কাজের মান",
      clear: "পরিষ্কার",
      review: "পর্যালোচনা",
      observed: "আপলোডে দেখা গেছে",
      guide: "সার্কিট সুরক্ষার মৌলিক বিষয়",
      guideTwo: "হাউস ওয়্যারিংয়ের মৌলিক বিষয়",
      guideThree: "পরীক্ষা ও যাচাইকরণ",
      pages: "পিডিএফ গাইড · ১৮ পৃষ্ঠা",
      checklist: "কাজ শুরুর আগের নিরাপত্তা পরীক্ষা",
      safetyItems: ["বিদ্যুৎ উৎস বিচ্ছিন্ন", "পিপিই পরীক্ষা", "টেস্ট যন্ত্র যাচাই", "কর্মক্ষেত্র নিরাপদ", "অনুমতিপত্র নিশ্চিত"],
      generated: "চেকলিস্ট প্রস্তুত",
      generatorPrompt: "বাসার লাইটিং সার্কিট স্থাপন ও পরীক্ষা",
      steps: "৮টি ধাপ",
      upcoming: "আসন্ন",
      progress: "চলমান",
      completed: "সম্পন্ন",
      taskA: "ডিস্ট্রিবিউশন বোর্ড পরীক্ষা",
      taskB: "লাইটিং সার্কিট টেস্ট",
      taskC: "কন্টিনিউটি ফলাফল লিখুন",
    },
    intro: {
      eyebrow: "একটি সমন্বিত টুলকিট",
      title: "ব্যবহারিক ইলেকট্রিক্যাল শিক্ষার প্রতিটি ধাপে সহায়তা",
      description:
        "সমস্যা বোঝা থেকে নিরাপদভাবে কাজ করা, অগ্রগতি লেখা এবং নিজের ব্যবহারিক দক্ষতা পর্যালোচনা—সব এক জায়গায় করুন।",
    },
    features: [
      {
        eyebrow: "০১ · ব্যবহারিক কাজের মূল্যায়ন",
        title: "কাজের ভিডিও থেকে দক্ষতাভিত্তিক মতামত নিন",
        description:
          "আপনার ব্যবহারিক কাজের ভিডিও আপলোড করুন। এআই ভিডিও অনুযায়ী দশটি প্রশ্ন তৈরি করে, ভিডিওতে প্রমাণ থাকা উত্তরগুলো খসড়া করে এবং মূল্যায়নের আগে প্রতিটি উত্তর সম্পাদনার সুযোগ দেয়।",
        points: [
          "নিরাপত্তা ও কাজের মানসহ ছয়টি নির্দিষ্ট দক্ষতার স্কোর",
          "গোছানো উন্নয়ন পরামর্শ",
          "সম্পন্ন মূল্যায়ন ব্যক্তিগত ইতিহাসে সংরক্ষণ",
        ],
        cta: "মূল্যায়ন শুরু করুন",
      },
      {
        eyebrow: "০২ · এআই ট্রাবলশুটিং সহকারী",
        title: "ইলেকট্রিক্যাল প্রশ্ন করুন এবং ধাপে ধাপে সমাধান করুন",
        description:
          "কোনো লক্ষণ, ত্রুটি বা সার্কিটের অস্বাভাবিক আচরণ বর্ণনা করুন। সহকারী আপনার প্রশ্নের সঙ্গে প্রাসঙ্গিক গাইড ও সাম্প্রতিক কথোপকথনের তথ্য মিলিয়ে পরিষ্কার উত্তর দেয়।",
        points: [
          "বাংলা অথবা ইংরেজিতে কথোপকথনভিত্তিক সহায়তা",
          "টেকনিক্যাল লাইব্রেরি থেকে প্রাসঙ্গিক তথ্য",
          "অ্যাকাউন্টে আলাদা আলাদা কথোপকথন সংরক্ষণ",
        ],
        cta: "সহকারীকে প্রশ্ন করুন",
      },
      {
        eyebrow: "০৩ · ওয়্যারিং ছবি বিশ্লেষক",
        title: "ছবি থেকে দৃশ্যমান ওয়্যারিং সমস্যা পর্যালোচনা করুন",
        description:
          "গোছানো ভিজ্যুয়াল বিশ্লেষণের জন্য পরিষ্কার ওয়্যারিং ছবি দিন। রিপোর্টে দৃশ্যমান উদ্বেগ, সম্ভাব্য প্রভাব ও পরবর্তী পরীক্ষার পরামর্শ দেখানো হয়।",
        points: [
          "পর্যবেক্ষণ ও অনুমান আলাদাভাবে উপস্থাপন",
          "ত্রুটি দেখা না গেলে ভালো কোণ থেকে ছবি চাওয়া",
          "ঝুঁকিপূর্ণ বিষয়ে সতর্ক ও করণীয়ভিত্তিক নির্দেশনা",
        ],
        cta: "ছবি পর্যালোচনা করুন",
      },
      {
        eyebrow: "০৪ · ওয়্যারিং ও সার্কিট গাইড লাইব্রেরি",
        title: "কাজের সময় নির্ভরযোগ্য শিক্ষাসামগ্রী কাছে রাখুন",
        description:
          "প্ল্যাটফর্মে সংরক্ষিত পিডিএফ গাইড ব্রাউজ করুন। ব্রাউজারের স্থির কার্ডের বদলে সার্কিট ব্যাখ্যা, ওয়্যারিং পদ্ধতি ও রেফারেন্স তথ্য খুঁজে নিন।",
        points: [
          "ব্যাকএন্ড থেকে পরিচালিত গাইডের তথ্য ব্রাউজ",
          "অ্যাপের ভেতরে পিডিএফ খোলা",
          "পরে পড়ার জন্য ডাউনলোড",
        ],
        cta: "গাইড দেখুন",
      },
      {
        eyebrow: "০৫ · নিরাপত্তা চেকলিস্ট লাইব্রেরি",
        title: "ব্যবহারিক নিরাপত্তা রেফারেন্স দিয়ে কাজ প্রস্তুত করুন",
        description:
          "ইলেকট্রিক্যাল কাজের আগে ও চলাকালে নির্দিষ্ট চেকলিস্ট পিডিএফ ব্যবহার করুন। শিরোনাম ও ফাইলের তথ্য ব্যাকএন্ড থেকে আসে, তাই প্ল্যাটফর্মের রিসোর্স হালনাগাদ রাখা যায়।",
        points: [
          "কাজের উপযোগী চেকলিস্টে দ্রুত প্রবেশ",
          "খোলা ও ডাউনলোডের সুবিধা",
          "প্রতিটি টুলের পাশে একই ধরনের নিরাপত্তা রেফারেন্স",
        ],
        cta: "নিরাপত্তা চেকলিস্ট খুলুন",
      },
      {
        eyebrow: "০৬ · এআই চেকলিস্ট তৈরি",
        title: "আপনার বর্ণনা করা কাজ অনুযায়ী চেকলিস্ট তৈরি করুন",
        description:
          "পরিকল্পিত ইলেকট্রিক্যাল কাজটি ব্যাখ্যা করুন এবং প্রস্তুতি, কাজ সম্পাদন, পরীক্ষা ও ডকুমেন্টেশনের জন্য গোছানো চেকলিস্ট তৈরি করুন।",
        points: [
          "একই সাধারণ তালিকার বদলে কাজভিত্তিক নির্দেশনা",
          "ব্যবহারিক ধাপে সাজানো",
          "কাজ শুরুর আগে পর্যালোচনার উপযোগী",
        ],
        cta: "চেকলিস্ট তৈরি করুন",
      },
      {
        eyebrow: "০৭ · টাস্ক ট্র্যাকার",
        title: "পরিকল্পনা থেকে শেষ পর্যন্ত ব্যবহারিক কাজ দৃশ্যমান রাখুন",
        description:
          "নিজের কাজ তৈরি করুন, অগ্রাধিকার ঠিক করুন এবং আসন্ন, চলমান ও সম্পন্ন অবস্থায় সরান। প্রতিটি কাজ সাইন-ইন করা ব্যবহারকারীর জন্য সংরক্ষিত থাকে।",
        points: [
          "সুপাবেসে ব্যবহারকারীভিত্তিক কাজ সংরক্ষণ",
          "সক্রিয় কাজ অগ্রাধিকার অনুযায়ী সাজানো",
          "অবস্থা বদলালে বোর্ডে সঙ্গে সঙ্গে আপডেট",
        ],
        cta: "টাস্ক ট্র্যাকার খুলুন",
      },
    ],
    safety: {
      eyebrow: "নিরাপত্তা কাজেরই অংশ",
      title: "এআই নির্দেশনা সিদ্ধান্ত নিতে সহায়তা করে—যোগ্য পরিদর্শনের বিকল্প নয়।",
      description:
        "ElectroMentor একটি শেখা ও সিদ্ধান্ত-সহায়ক টুল। বিদ্যুৎ বিচ্ছিন্ন করুন, স্থানীয় বিধিমালা মানুন, উপযুক্ত পিপিই ব্যবহার করুন এবং পরিস্থিতি অনিশ্চিত বা ঝুঁকিপূর্ণ হলে যোগ্য পেশাজীবীর সহায়তা নিন।",
      note: "শুধু এআই উত্তর বা ছবি বিশ্লেষণের ওপর নির্ভর করে কখনো চালু সার্কিটে কাজ করবেন না।",
    },
    workflow: {
      eyebrow: "যেভাবে কাজ করে",
      title: "সাইন-ইন থেকে নিরাপদ ও পর্যালোচনামূলক অনুশীলন",
      description: "কাজ অনুযায়ী সঠিক টুল বেছে নিন এবং একটি অ্যাকাউন্টে শেখার তথ্য সংযুক্ত রাখুন।",
      steps: [
        { title: "ওয়ার্কস্পেস তৈরি করুন", description: "সুপাবেসের মাধ্যমে নিরাপদে সাইন ইন করে বাংলা বা ইংরেজি বেছে নিন।" },
        { title: "সঠিক টুল ব্যবহার করুন", description: "প্রশ্ন করুন, কাজের প্রমাণ আপলোড করুন, গাইড খুলুন অথবা কাজ পরিকল্পনা করুন।" },
        { title: "পর্যালোচনা ও উন্নতি করুন", description: "প্রমাণ যাচাই করুন, নিরাপত্তা নিয়ন্ত্রণ মানুন এবং সময়ের সঙ্গে অগ্রগতি ধরে রাখুন।" },
      ],
    },
    final: {
      eyebrow: "কাজ শুরু হলেই প্রস্তুত",
      title: "ব্যবহারিক শিক্ষা, নিরাপত্তা ও এআই সহায়তা এক জায়গায় রাখুন।",
      description: "অ্যাকাউন্ট তৈরি করুন অথবা সাইন ইন করে ElectroMentor ওয়ার্কস্পেস খুলুন।",
      cta: "ElectroMentor খুলুন",
    },
    footer: {
      description: "বাংলা ও ইংরেজিতে ব্যবহারিক ইলেকট্রিক্যাল শিক্ষা, নিরাপত্তা ও ট্রাবলশুটিং নির্দেশনা।",
      quick: "দ্রুত নেভিগেশন",
      tools: "প্রোডাক্ট টুলস",
      overview: "প্রোডাক্ট পরিচিতি",
      start: "সাইন ইন ও শুরু",
      rights: "সর্বস্বত্ব সংরক্ষিত।",
      safety: "যথাযথ আইসোলেশন, পিপিই ও যোগ্য তত্ত্বাবধানে এআই নির্দেশনা ব্যবহার করুন।",
      developed: "ডেভেলপ করেছে",
      powered: "পাওয়ার্ড বাই",
      backToTop: "উপরে ফিরুন",
    },
  },
};

const FEATURE_CONFIG: {
  id: string;
  href: string;
  icon: LucideIcon;
  kind: FeatureKind;
  tone: string;
}[] = [
  { id: "practical-assessment", href: "/assessments/new/upload", icon: BadgeCheck, kind: "assessment", tone: "blue" },
  { id: "ai-assistant", href: "/assistant", icon: Bot, kind: "assistant", tone: "cyan" },
  { id: "photo-analysis", href: "/photo-analysis", icon: Camera, kind: "photo", tone: "purple" },
  { id: "guide-library", href: "/guides", icon: BookOpen, kind: "guides", tone: "amber" },
  { id: "safety-checklists", href: "/safety-checklists", icon: ShieldCheck, kind: "safety", tone: "green" },
  { id: "checklist-generator", href: "/safety-checklists/generate", icon: Sparkles, kind: "generator", tone: "blue" },
  { id: "task-tracker", href: "/practice-tracker", icon: ListTodo, kind: "tracker", tone: "purple" },
];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function authenticatedPath(path: string) {
  return `/login?next=${encodeURIComponent(path)}`;
}

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.scoreRow}>
      <span>{label}</span>
      <div><i style={{ width: `${value}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
}

function FeaturePreview({ kind, copy }: { kind: FeatureKind; copy: LandingCopy["preview"] }) {
  if (kind === "assessment") {
    return (
      <div className={styles.assessmentPreview}>
        <div className={styles.previewHeader}><span><BadgeCheck size={17} /> {copy.assessment}</span><b>84%</b></div>
        <div className={styles.scoreList}>
          <ScoreRow label={copy.safety} value={91} />
          <ScoreRow label={copy.toolUsage} value={82} />
          <ScoreRow label={copy.workQuality} value={78} />
        </div>
        <div className={styles.feedbackLine}><Sparkles size={15} /><span>{copy.review}</span><strong>3</strong></div>
      </div>
    );
  }

  if (kind === "assistant") {
    return (
      <div className={styles.chatPreview}>
        <div className={styles.chatHeader}><span className={styles.miniIcon}><Bot size={17} /></span><div><strong>{copy.assistant}</strong><small>Gemini + RAG</small></div><i /></div>
        <div className={styles.userBubble}>{copy.assistantQuestion}</div>
        <div className={styles.aiBubble}><Zap size={15} /><p>{copy.assistantText}</p></div>
        <div className={styles.sourceChip}><FileText size={13} /> {copy.assistantSource}</div>
      </div>
    );
  }

  if (kind === "photo") {
    return (
      <div className={styles.photoPreview}>
        <div className={styles.photoFrame}>
          <div className={styles.wireBlue} /><div className={styles.wireAmber} />
          <span className={styles.focusBox}><i /></span>
          <span className={styles.uploadTag}><Upload size={13} /> {copy.observed}</span>
        </div>
        <div className={styles.photoFinding}>
          <span className={styles.findingIcon}><Camera size={17} /></span>
          <div><strong>{copy.photo}</strong><p>{copy.photoText}</p></div>
          <span className={styles.reviewBadge}>{copy.review}</span>
        </div>
      </div>
    );
  }

  if (kind === "guides") {
    return (
      <div className={styles.libraryPreview}>
        {[copy.guide, copy.guideTwo, copy.guideThree].map((title, index) => (
          <div className={styles.documentRow} key={title}>
            <span><FileText size={18} /></span><div><strong>{title}</strong><small>{copy.pages}</small></div>
            <ChevronRight size={16} />
            {index === 0 && <i>PDF</i>}
          </div>
        ))}
      </div>
    );
  }

  if (kind === "safety") {
    return (
      <div className={styles.checklistPreview}>
        <div className={styles.previewHeader}><span><ShieldCheck size={17} /> {copy.checklist}</span><b>4/5</b></div>
        {copy.safetyItems.map((item, index) => (
          <div className={styles.checkRow} key={item}><span className={index === 4 ? styles.emptyCheck : ""}>{index < 4 && <Check size={12} />}</span><p>{item}</p></div>
        ))}
      </div>
    );
  }

  if (kind === "generator") {
    return (
      <div className={styles.generatorPreview}>
        <div className={styles.promptBox}><Wrench size={18} /><p>{copy.generatorPrompt}</p><span><Sparkles size={14} /></span></div>
        <div className={styles.generatedCard}>
          <div><FileCheck2 size={18} /><strong>{copy.generated}</strong><span>{copy.steps}</span></div>
          {[65, 82, 74].map((width, index) => <i key={index} style={{ width: `${width}%` }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.taskPreview}>
      {[
        [copy.upcoming, copy.taskA, "amber"],
        [copy.progress, copy.taskB, "blue"],
        [copy.completed, copy.taskC, "green"],
      ].map(([status, task, tone]) => (
        <div className={styles.taskColumn} key={status}>
          <span className={styles[`taskDot${tone}`]} /><strong>{status}</strong><small>1</small>
          <p>{task}</p>
        </div>
      ))}
    </div>
  );
}

export function LandingPage() {
  const { language, setLanguage } = useLanguage();
  const copy = COPY[language];
  const [dark, setDark] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installNotice, setInstallNotice] = useState<"help" | "dismissed" | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("electromentor-landing-theme");
    setDark(savedTheme ? savedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallNotice(null);
    };

    setInstalled(isStandalone());
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      window.localStorage.setItem("electromentor-landing-theme", next ? "dark" : "light");
      return next;
    });
  }

  async function requestInstall() {
    if (installed) return;
    if (!installPrompt) {
      setInstallNotice("help");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") setInstallNotice("dismissed");
  }

  return (
    <div className={`${styles.page} ${dark ? styles.dark : ""}`} id="top">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.logoLink} href="#top" aria-label="ElectroMentor AI">
            <Brand />
          </Link>
          <nav className={styles.nav} aria-label="Landing page">
            <a href="#features">{copy.nav.features}</a>
            <a href="#how-it-works">{copy.nav.workflow}</a>
            <a href="#safety-first">{copy.nav.safety}</a>
          </nav>
          <div className={styles.headerActions}>
            <div className={styles.languageToggle} aria-label={copy.language}>
              {(["en", "bn"] as const).map((item) => (
                <button type="button" className={language === item ? styles.activeLanguage : ""} onClick={() => setLanguage(item)} key={item} aria-pressed={language === item}>
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            <button className={styles.iconButton} type="button" onClick={toggleTheme} aria-label={copy.theme} aria-pressed={dark}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className={styles.installButton} type="button" onClick={() => void requestInstall()} disabled={installed}>
              {installed ? <Check size={16} /> : <Download size={16} />}
              <span>{installed ? copy.installed : copy.install}</span>
            </button>
            <Link className={styles.loginButton} href="/login">{copy.login}<ArrowRight size={15} /></Link>
          </div>
        </div>
      </header>

      {installNotice && (
        <div className={styles.installNotice} role="status">
          <Download size={17} /><span>{installNotice === "help" ? copy.installHelp : copy.installDismissed}</span>
          <button type="button" onClick={() => setInstallNotice(null)} aria-label={copy.close}><X size={16} /></button>
        </div>
      )}

      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroGlowOne} /><div className={styles.heroGlowTwo} />
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}><Sparkles size={14} /> {copy.hero.eyebrow}</p>
                <h1 id="landing-title">{copy.hero.title}</h1>
                <p className={styles.heroDescription}>{copy.hero.description}</p>
                <div className={styles.heroActions}>
                  <Link className={styles.primaryCta} href={authenticatedPath("/dashboard")}>{copy.hero.primary}<ArrowRight size={17} /></Link>
                  <a className={styles.secondaryCta} href="#features">{copy.hero.secondary}<ChevronRight size={17} /></a>
                </div>
                <div className={styles.heroBadges}>
                  {copy.hero.badges.map((badge) => <span key={badge}><Check size={13} />{badge}</span>)}
                </div>
              </div>

              <div className={styles.heroVisual} aria-label={copy.preview.label}>
                <div className={styles.previewChrome}>
                  <div className={styles.previewTop}><span><i /><i /><i /></span><b>{copy.preview.label}</b><em /></div>
                  <div className={styles.previewBody}>
                    <aside className={styles.previewRail}>
                      <span className={styles.previewLogo}><Zap size={17} /></span>
                      {[Bot, Camera, BookOpen, ClipboardCheck].map((Icon, index) => <i className={index === 0 ? styles.previewActive : ""} key={index}><Icon size={15} /></i>)}
                    </aside>
                    <div className={styles.previewContent}>
                      <div className={styles.previewTitle}><div><small>ElectroMentor AI</small><strong>{copy.preview.workspace}</strong></div><span>EN · BN</span></div>
                      <div className={styles.previewGrid}>
                        <div className={styles.previewChatCard}>
                          <span><Bot size={16} /></span><div><strong>{copy.preview.assistant}</strong><p>{copy.preview.assistantText}</p></div>
                        </div>
                        <div className={styles.previewPhotoCard}>
                          <span><Camera size={16} /></span><div><strong>{copy.preview.photo}</strong><p>{copy.preview.photoText}</p></div><i>{copy.preview.review}</i>
                        </div>
                        <div className={styles.previewAssessmentCard}>
                          <div><strong>{copy.preview.assessment}</strong><b>84%</b></div>
                          <ScoreRow label={copy.preview.safety} value={91} />
                          <ScoreRow label={copy.preview.workQuality} value={78} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <span className={styles.floatingSafety}><ShieldCheck size={18} /><span>{copy.preview.safety}</span><Check size={15} /></span>
                <span className={styles.floatingGuide}><BookOpen size={17} /><span>{copy.preview.guide}</span></span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.featureIntro} id="features">
          <div className={styles.narrowContainer}>
            <p className={styles.eyebrow}>{copy.intro.eyebrow}</p>
            <h2>{copy.intro.title}</h2>
            <p>{copy.intro.description}</p>
          </div>
        </section>

        <div className={styles.featureList}>
          {FEATURE_CONFIG.map((config, index) => {
            const feature = copy.features[index];
            const Icon = config.icon;
            return (
              <section className={styles.featureSection} id={config.id} key={config.id}>
                <div className={`${styles.container} ${styles.featureGrid} ${index % 2 === 1 ? styles.reverse : ""}`}>
                  <div className={styles.featureCopy}>
                    <span className={`${styles.featureIcon} ${styles[config.tone]}`}><Icon size={22} /></span>
                    <p className={styles.eyebrow}>{feature.eyebrow}</p>
                    <h2>{feature.title}</h2>
                    <p className={styles.featureDescription}>{feature.description}</p>
                    <ul>
                      {feature.points.map((point) => <li key={point}><Check size={15} /> <span>{point}</span></li>)}
                    </ul>
                    <Link className={styles.textLink} href={authenticatedPath(config.href)}>{feature.cta}<ArrowRight size={16} /></Link>
                  </div>
                  <div className={`${styles.featureVisual} ${styles[`${config.tone}Visual`]}`}>
                    <FeaturePreview kind={config.kind} copy={copy.preview} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <section className={styles.safetySection} id="safety-first">
          <div className={styles.container}>
            <div className={styles.safetyCard}>
              <span className={styles.safetyIcon}><ShieldCheck size={31} /></span>
              <div>
                <p className={styles.eyebrow}>{copy.safety.eyebrow}</p>
                <h2>{copy.safety.title}</h2>
                <p>{copy.safety.description}</p>
                <strong><Zap size={15} />{copy.safety.note}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.workflowSection} id="how-it-works">
          <div className={styles.container}>
            <div className={styles.workflowHeading}>
              <p className={styles.eyebrow}>{copy.workflow.eyebrow}</p>
              <h2>{copy.workflow.title}</h2>
              <p>{copy.workflow.description}</p>
            </div>
            <div className={styles.workflowGrid}>
              {copy.workflow.steps.map((step, index) => (
                <article key={step.title}>
                  <span>0{index + 1}</span><i>{index === 0 ? <Languages size={22} /> : index === 1 ? <Wrench size={22} /> : <RefreshCw size={22} />}</i>
                  <h3>{step.title}</h3><p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.finalSection}>
          <div className={styles.container}>
            <div className={styles.finalCard}>
              <div><p className={styles.eyebrow}>{copy.final.eyebrow}</p><h2>{copy.final.title}</h2><p>{copy.final.description}</p></div>
              <div className={styles.finalActions}>
                <Link className={styles.lightCta} href={authenticatedPath("/dashboard")}>{copy.final.cta}<ArrowRight size={17} /></Link>
                <button type="button" className={styles.outlineCta} onClick={() => void requestInstall()} disabled={installed}><Download size={16} />{installed ? copy.installed : copy.install}</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}><Brand /><p>{copy.footer.description}</p></div>
            <div><h3>{copy.footer.quick}</h3><a href="#top">{copy.footer.overview}</a><a href="#features">{copy.nav.features}</a><a href="#how-it-works">{copy.nav.workflow}</a><button type="button" onClick={() => void requestInstall()}>{copy.install}</button></div>
            <div><h3>{copy.footer.tools}</h3><Link href={authenticatedPath("/assessments/new/upload")}>{copy.features[0].eyebrow.split(" · ")[1]}</Link><Link href={authenticatedPath("/assistant")}>{copy.features[1].eyebrow.split(" · ")[1]}</Link><Link href={authenticatedPath("/photo-analysis")}>{copy.features[2].eyebrow.split(" · ")[1]}</Link><Link href={authenticatedPath("/guides")}>{copy.features[3].eyebrow.split(" · ")[1]}</Link></div>
            <div className={styles.footerStart}><h3>{copy.footer.start}</h3><p>{copy.footer.safety}</p><Link href="/login">{copy.login}<ArrowRight size={15} /></Link></div>
          </div>
          <div className={styles.footerBottom}>
            <span>© {new Date().getFullYear()} ElectroMentor AI. {copy.footer.rights}</span>
            <span>{copy.footer.developed} <b>ACI MIS AI TEAM</b><i />{copy.footer.powered} <b>ACI PLC</b></span>
          </div>
        </div>
        <a className={styles.backToTop} href="#top" aria-label={copy.footer.backToTop}><ArrowRight size={19} /></a>
      </footer>
    </div>
  );
}
