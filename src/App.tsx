/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { 
  LayoutDashboard, 
  StickyNote, 
  Settings as SettingsIcon, 
  Plus, 
  CheckCircle2, 
  Calendar,
  Clock,
  Search,
  Bell,
  User,
  ChevronRight,
  MoreVertical,
  Star,
  Timer as TimerIcon,
  Play,
  Lightbulb,
  Sparkles,
  Send,
  Loader2,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  Zap
} from 'lucide-react';

// --- Types ---
type Tab = 'dashboard' | 'calendar' | 'timer' | 'notes' | 'settings';

interface Task {
  id: string;
  title: string;
  description?: string;
  category: string;
  time: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
  color: string;
  tags: string[];
}

interface ScheduleItem {
  id: string;
  hour: string;
  title?: string;
  category?: string;
  color?: string;
}

// --- Mock Data ---
const MOCK_TASKS: Task[] = [
  { id: '1', title: 'Finish project presentation', description: 'Complete the slides for the Q4 review meeting.', category: 'Work', time: '10:00 AM', completed: false, priority: 'high', tags: ['urgent', 'meeting'] },
  { id: '2', title: 'Buy groceries', category: 'Personal', time: '05:30 PM', completed: false, priority: 'medium', tags: ['home'] },
  { id: '3', title: 'Gym session', category: 'Health', time: '07:00 AM', completed: true, priority: 'medium', tags: ['fitness'] },
  { id: '4', title: 'Call Mama', description: 'Ask about the weekend plans.', category: 'Personal', time: '08:00 PM', completed: false, priority: 'low', tags: ['family'] },
];

const CATEGORIES = ['Work', 'Personal', 'Health', 'Finance', 'Ideas'];
const PRIORITIES: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];

const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const createTaskDecl: FunctionDeclaration = {
  name: "createTask",
  description: "Creates a new task in the user's to-do list.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "The task title" },
      description: { type: Type.STRING, description: "Optional detailed description" },
      category: { type: Type.STRING, enum: CATEGORIES, description: "The task category" },
      priority: { type: Type.STRING, enum: PRIORITIES, description: "Task priority level" },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Optional tags" },
    },
    required: ["title", "category", "priority"],
  },
};

const createNoteDecl: FunctionDeclaration = {
  name: "createNote",
  description: "Creates a new note or memo for the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "The note title" },
      content: { type: Type.STRING, description: "The note content" },
    },
    required: ["title", "content"],
  },
};

const createEventDecl: FunctionDeclaration = {
  name: "createEvent",
  description: "Adds a new event or reminder to the schedule/calendar.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "Event title" },
      hour: { type: Type.STRING, description: "Time of the event in 24h format (HH:mm), e.g., '14:30'" },
      category: { type: Type.STRING, description: "Event category" },
    },
    required: ["title", "hour", "category"],
  },
};

const MOCK_NOTES: Note[] = [
  { id: '1', title: 'Ideas for Next App', content: 'Use AI for task prioritization and smart reminders based on location.', date: 'Oct 12', color: 'bg-blue-100', tags: ['startup', 'ai'] },
  { id: '2', title: 'Gift List', content: 'AirPods Max for Sarah, Kindle for Dad, and something nice for the team.', date: 'Oct 10', color: 'bg-purple-100', tags: ['shopping'] },
  { id: '3', title: 'Meeting Notes', content: 'Discuss the Q4 roadmap and the new design system implementation.', date: 'Oct 09', color: 'bg-amber-100', tags: ['work', 'design'] },
];

const MOCK_SCHEDULE: ScheduleItem[] = [
  { id: '1', hour: '08:00', title: 'Morning Yoga', category: 'Health', color: 'bg-emerald-100 border-emerald-200' },
  { id: '2', hour: '09:00' },
  { id: '3', hour: '10:00', title: 'Team Sync', category: 'Work', color: 'bg-blue-100 border-blue-200' },
  { id: '4', hour: '11:00' },
  { id: '5', hour: '12:00', title: 'Lunch Break', category: 'Personal', color: 'bg-slate-100 border-slate-200' },
  { id: '6', hour: '13:00' },
  { id: '7', hour: '14:00', title: 'Deep Work', category: 'Work', color: 'bg-indigo-100 border-indigo-200' },
];

// --- Sub-components ---

const AIAssistant = ({ isOpen, onClose, onAction }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAction: (type: 'task' | 'note' | 'event', data: any) => void 
}) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "Hi! I'm Flowy, your AI productivity assistant. Send me a message like 'Remind me to buy coffee at 3pm' or 'Note down my startup idea' and I'll handle it for you!" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await aiClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: "You are Flowy, a helpful and minimalist productivity assistant. You use function calls to create tasks, notes, and events for the user. Always confirm what you've done in a friendly, concise manner.",
          tools: [{ functionDeclarations: [createTaskDecl, createNoteDecl, createEventDecl] }]
        }
      });

      const functionCalls = response.functionCalls;
      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === 'createTask') {
            onAction('task', call.args);
          } else if (call.name === 'createNote') {
            onAction('note', call.args);
          } else if (call.name === 'createEvent') {
            onAction('event', call.args);
          }
        }
        setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Done! I've added that for you." }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text || "I'm not sure how to help with that. Try asking me to create a task, note, or event!" }]);
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having a bit of trouble right now. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="w-full max-w-md h-[80vh] sm:h-[600px] bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-brand-primary text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="font-bold font-display">Flowy AI</h2>
                  <p className="text-xs text-white/70">Always at your service</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] p-4 rounded-3xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-brand-primary text-white rounded-tr-none' 
                      : 'bg-slate-100 text-slate-800 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 p-4 rounded-3xl rounded-tl-none flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-brand-primary" />
                    <span className="text-xs font-medium text-slate-500">Flowy is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-6 bg-slate-50">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Ask Flowy anything..."
                  className="w-full h-14 bg-white rounded-2xl pl-6 pr-14 text-sm font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button 
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 w-10 h-10 bg-brand-primary text-white rounded-xl flex items-center justify-center disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const TaskCreator = ({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (task: Task) => void }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Personal');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
      setTags([...tags, tagInput.trim().toLowerCase()]);
      setTagInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      description,
      category,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      completed: false,
      priority,
      tags
    };

    onAdd(newTask);
    setTitle('');
    setDescription('');
    setTags([]);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold font-display">New Task</h2>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <MoreVertical size={20} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title & Desc */}
              <div className="space-y-4">
                <input
                  autoFocus
                  type="text"
                  placeholder="What needs to be done?"
                  className="w-full text-xl font-semibold placeholder:text-slate-300 focus:outline-none"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  placeholder="Add details / notes..."
                  className="w-full text-slate-500 text-sm resize-none focus:outline-none min-h-[80px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Categorization */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Category & Priority</p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex bg-slate-50 p-1 rounded-xl">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase transition-all ${priority === p ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <select 
                    className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase px-3 py-1.5 rounded-xl border-none focus:ring-0 appearance-none cursor-pointer"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tags</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {tags.map((tag, i) => (
                    <span key={i} className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                      #{tag}
                      <button type="button" onClick={() => setTags(tags.filter((_, idx) => idx !== i))} className="hover:text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Add tag..."
                      className="bg-slate-50 text-[10px] font-bold text-slate-500 px-3 py-1.5 rounded-xl w-24 focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-100"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={!title.trim()}
                  className="w-full h-14 bg-brand-primary text-white rounded-2xl font-bold shadow-xl shadow-brand-primary/20 disabled:opacity-50 disabled:shadow-none active:scale-[0.98] transition-transform"
                >
                  Create Task
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const NoteCreator = ({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (note: Note) => void }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState('bg-blue-100');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const colors = [
    { class: 'bg-blue-100', name: 'Blue' },
    { class: 'bg-purple-100', name: 'Purple' },
    { class: 'bg-amber-100', name: 'Amber' },
    { class: 'bg-rose-100', name: 'Rose' },
    { class: 'bg-emerald-100', name: 'Emerald' },
    { class: 'bg-slate-100', name: 'Slate' },
  ];

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
      setTags([...tags, tagInput.trim().toLowerCase()]);
      setTagInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      content,
      color,
      tags,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
    };

    onAdd(newNote);
    setTitle('');
    setContent('');
    setTags([]);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold font-display">New Note</h2>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <MoreVertical size={20} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <input
                  autoFocus
                  type="text"
                  placeholder="Note Title"
                  className="w-full text-xl font-bold placeholder:text-slate-300 focus:outline-none"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  placeholder="Start typing your note..."
                  className="w-full text-slate-600 text-sm resize-none focus:outline-none min-h-[150px] leading-relaxed"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              {/* Color Picker */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Note Color</p>
                <div className="flex gap-3">
                  {colors.map((c) => (
                    <button
                      key={c.class}
                      type="button"
                      onClick={() => setColor(c.class)}
                      className={`w-8 h-8 rounded-full ${c.class} border-2 transition-all ${color === c.class ? 'border-brand-primary scale-110' : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tags</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {tags.map((tag, i) => (
                    <span key={i} className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                      #{tag}
                      <button type="button" onClick={() => setTags(tags.filter((_, idx) => idx !== i))} className="hover:text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="Add tag..."
                    className="bg-slate-50 text-[10px] font-bold text-slate-500 px-3 py-1.5 rounded-xl w-24 focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-100"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={!title.trim() || !content.trim()}
                  className="w-full h-14 bg-brand-primary text-white rounded-2xl font-bold shadow-xl shadow-brand-primary/20 disabled:opacity-50 disabled:shadow-none active:scale-[0.98] transition-transform"
                >
                  Save Note
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const CalendarView = ({ schedule }: { schedule: ScheduleItem[] }) => {
  const days = [
    { day: 'Mon', date: '08' },
    { day: 'Tue', date: '09' },
    { day: 'Wed', date: '10' },
    { day: 'Thu', date: '11', active: true },
    { day: 'Fri', date: '12' },
    { day: 'Sat', date: '13' },
    { day: 'Sun', date: '14' },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="px-4">
        <h1 className="text-3xl font-bold font-display tracking-tight mb-2">Calendar</h1>
        <div className="flex items-center gap-2 text-slate-500 font-medium">
          <span>October 2026</span>
          <ChevronRight size={16} />
        </div>
      </div>

      {/* Week View */}
      <div className="overflow-x-auto px-4 scrollbar-none">
        <div className="flex gap-3 min-w-max pb-2">
          {days.map((d, i) => (
            <motion.button 
              key={i}
              whileTap={{ scale: 0.95 }}
              className={`flex flex-col items-center justify-center w-14 h-20 rounded-2xl transition-all ${d.active ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/30' : 'bg-white text-slate-500'}`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider mb-1">{d.day}</span>
              <span className="text-lg font-bold">{d.date}</span>
              {d.active && <div className="w-1 h-1 bg-white rounded-full mt-1"></div>}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Schedule */}
      <div className="px-4 mt-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold font-display">Schedule</h2>
          <span className="text-sm text-slate-400">{schedule.filter(s => s.title).length} Events</span>
        </div>

        <div className="space-y-0 relative before:absolute before:left-14 before:top-4 before:bottom-4 before:w-px before:bg-slate-100">
          {schedule.map((item) => (
            <div key={item.id} className="flex gap-6 min-h-[80px]">
              <div className="w-8 pt-1 text-[11px] font-bold text-slate-400 uppercase">
                {item.hour}
              </div>
              <div className="flex-1 pb-6">
                {item.title ? (
                  <motion.div 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-4 rounded-2xl border-l-4 ${item.color} shadow-sm group cursor-pointer hover:shadow-md transition-shadow`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900">{item.title}</h4>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{item.category}</span>
                      </div>
                      <MoreVertical size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full border-b border-slate-50"></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const FocusTimer = () => {
  const [timeLeft, setTimeLeft] = React.useState(25 * 60);
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeSession, setActiveSession] = React.useState<'focus' | 'short' | 'long'>('focus');
  const [totalTime, setTotalTime] = React.useState(25 * 60);

  const sessions = [
    { id: 'focus', label: 'Focus', minutes: 25, icon: <Brain size={16} /> },
    { id: 'short', label: 'Short Break', minutes: 5, icon: <Coffee size={16} /> },
    { id: 'long', label: 'Long Break', minutes: 15, icon: <Zap size={16} /> },
  ];

  React.useEffect(() => {
    let interval: any;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      // In a real app, trigger notification here
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSessionChange = (type: 'focus' | 'short' | 'long', mins: number) => {
    setActiveSession(type);
    setTotalTime(mins * 60);
    setTimeLeft(mins * 60);
    setIsRunning(false);
  };

  const progress = ((totalTime - timeLeft) / totalTime) * 100;

  return (
    <div className="space-y-8 px-4 pb-20">
      <div className="text-center">
        <h1 className="text-3xl font-bold font-display tracking-tight">Focus Timer</h1>
        <p className="text-slate-500 text-sm">Be productive, stay focused!</p>
      </div>

      {/* Session Selectors */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSessionChange(s.id as any, s.minutes)}
            className={`flex-1 py-3 px-2 rounded-xl flex flex-col items-center gap-1 transition-all ${activeSession === s.id ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-slate-400'}`}
          >
            {s.icon}
            <span className="text-[10px] font-bold uppercase tracking-tight">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Timer Display */}
      <div className="relative flex items-center justify-center py-10">
        <svg className="w-72 h-72 -rotate-90">
          <circle
            cx="144"
            cy="144"
            r="135"
            stroke="currentColor"
            strokeWidth="10"
            fill="transparent"
            className="text-slate-100"
          />
          <motion.circle
            cx="144"
            cy="144"
            r="135"
            stroke="currentColor"
            strokeWidth="10"
            fill="transparent"
            strokeDasharray={2 * Math.PI * 135}
            initial={{ strokeDashoffset: 2 * Math.PI * 135 }}
            animate={{ strokeDashoffset: (2 * Math.PI * 135) * (1 - progress / 100) }}
            transition={{ type: "spring", bounce: 0, duration: 1 }}
            className="text-brand-primary"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <motion.span 
            key={formatTime(timeLeft)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-6xl font-bold font-display tracking-tighter text-slate-900"
          >
            {formatTime(timeLeft)}
          </motion.span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Time Remaining</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button 
          onClick={() => {
            setIsRunning(false);
            setTimeLeft(totalTime);
          }}
          className="w-14 h-14 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition-transform"
        >
          <RotateCcw size={24} />
        </button>
        <button 
          onClick={() => setIsRunning(!isRunning)}
          className="w-24 h-24 rounded-full bg-brand-primary text-white shadow-2xl shadow-brand-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          {isRunning ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" className="translate-x-1" />}
        </button>
        <button className="w-14 h-14 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition-transform">
          <Bell size={24} />
        </button>
      </div>

      {/* Daily Goal Progress */}
      <div className="p-4 rounded-3xl bg-white border border-slate-100 flex items-center gap-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
          <Brain size={24} />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-bold text-sm text-slate-900 uppercase tracking-tight">Today's Focus Goal</h4>
            <span className="text-[10px] font-bold text-slate-500">2 / 4 hours</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 w-1/2 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ tasks, onToggleTask, onOpenCreator, onOpenAI }: { 
  tasks: Task[]; 
  onToggleTask: (id: string) => void; 
  onOpenCreator: () => void;
  onOpenAI: () => void;
}) => (
  <div className="space-y-6 pb-20">
    {/* AI Magic Widget */}
    <div className="px-4">
      <motion.button 
        whileTap={{ scale: 0.98 }}
        onClick={onOpenAI}
        className="w-full p-6 rounded-[2rem] bg-gradient-to-br from-indigo-600 via-brand-primary to-blue-400 text-white shadow-xl shadow-brand-primary/30 flex items-center justify-between relative overflow-hidden group"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-white/80" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Magic Assistant</span>
          </div>
          <h3 className="text-xl font-bold font-display text-left">How can I help you <br/>reach your goals?</h3>
          <p className="text-white/60 text-[10px] font-medium mt-2 text-left uppercase tracking-wider">Tap to chat with Flowy AI</p>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center relative z-10 transition-transform group-hover:scale-110">
          <Brain size={32} />
        </div>
        
        {/* Animated Orbs */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/20 rounded-full blur-xl -ml-10 -mb-10" />
      </motion.button>
    </div>

    {/* Header */}
    <div className="flex justify-between items-center mb-8 px-4">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight">FocusFlow</h1>
        <p className="text-slate-500 text-sm">Hello, Prasun! 👋</p>
      </div>
      <div className="flex gap-3">
        <button className="p-2 rounded-full bg-white shadow-sm border border-slate-100 relative">
          <Bell size={20} className="text-slate-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <div className="w-10 h-10 rounded-full bg-brand-primary overflow-hidden border-2 border-white shadow-sm">
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Prasun" alt="User Profile" />
        </div>
      </div>
    </div>

    {/* Stat Cards */}
    <div className="grid grid-cols-2 gap-4 px-4">
      <div className="p-5 rounded-3xl bg-brand-primary text-white space-y-2 shadow-lg shadow-brand-primary/20">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <CheckCircle2 size={24} />
        </div>
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold font-display">{tasks.filter(t => t.completed).length} Tasks</p>
        </div>
      </div>
      <div className="p-5 rounded-3xl bg-white text-slate-900 border border-slate-100 space-y-2 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
          <Clock size={24} />
        </div>
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Remaining</p>
          <p className="text-2xl font-bold font-display text-slate-900">{tasks.filter(t => !t.completed).length} Tasks</p>
        </div>
      </div>
    </div>

    {/* Section: Today's Tasks */}
    <div className="px-4">
      <div className="flex justify-between items-end mb-4">
        <h2 className="text-xl font-bold font-display leading-none">Today's Tasks</h2>
        <button className="text-brand-primary text-sm font-semibold">See All</button>
      </div>
      <div className="space-y-3">
        {tasks.length > 0 ? tasks.map((task) => (
          <motion.div 
            key={task.id}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-4 rounded-3xl flex items-center justify-between border ${task.completed ? 'bg-slate-50 border-transparent transition-opacity opacity-70' : 'bg-white border-slate-100 shadow-sm'}`}
          >
            <div className="flex items-center gap-4">
              <button 
                onClick={() => onToggleTask(task.id)}
                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-brand-primary border-brand-primary text-white' : 'border-slate-300 bg-white hover:border-brand-primary'}`}
              >
                {task.completed && <CheckCircle2 size={14} strokeWidth={3} />}
              </button>
              <div>
                <h3 className={`font-semibold text-sm ${task.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500">{task.category}</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock size={10} /> {task.time}
                  </span>
                </div>
                {task.tags && task.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {task.tags.map(tag => (
                      <span key={tag} className="text-[8px] font-bold text-brand-primary/60 uppercase tracking-tighter">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {task.priority === 'high' && !task.completed && (
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-200"></div>
            )}
          </motion.div>
        )) : (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
              <LayoutDashboard size={32} />
            </div>
            <div>
              <p className="font-bold text-slate-400">All caught up!</p>
              <p className="text-xs text-slate-400">Relax or add something new to achieve.</p>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Quick Add */}
    <div className="px-4 pt-2">
      <button 
        onClick={onOpenCreator}
        className="w-full h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-2 font-semibold shadow-xl shadow-slate-900/10 active:scale-[0.98] transition-transform"
      >
        <Plus size={20} />
        Add New Task
      </button>
    </div>
  </div>
);

const Notes = ({ notes, onOpenCreator }: { notes: Note[]; onOpenCreator: () => void }) => (
  <div className="space-y-6 px-4 pb-20">
    <div className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight">Notes</h1>
        <p className="text-slate-500 text-sm">{notes.length} notes saved</p>
      </div>
      <button 
        onClick={onOpenCreator}
        className="p-3 rounded-2xl bg-brand-primary text-white shadow-lg shadow-brand-primary/20"
      >
        <Plus size={24} />
      </button>
    </div>

    <div className="grid grid-cols-1 gap-4">
      {notes.length > 0 ? notes.map((note) => (
        <motion.div 
          key={note.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-6 rounded-3xl ${note.color} border border-black/5 flex flex-col justify-between min-h-[160px]`}
        >
          <div>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-slate-900 text-lg">{note.title}</h3>
              <button className="p-1 hover:bg-black/5 rounded-lg active:scale-90 transition-transform">
                <MoreVertical size={16} className="text-slate-600" />
              </button>
            </div>
            <p className="text-slate-700 text-sm line-clamp-3 leading-relaxed whitespace-pre-wrap">
              {note.content}
            </p>
            {note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {note.tags.map(tag => (
                  <span key={tag} className="text-[9px] font-bold text-black/40 uppercase tracking-tighter bg-black/5 px-2 py-0.5 rounded-lg">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-black/5">
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 uppercase tracking-wider">
              <Calendar size={10} /> {note.date}
            </span>
            <button className="p-1 text-slate-400 active:scale-110 transition-transform hover:text-amber-500">
              <Star size={14} />
            </button>
          </div>
        </motion.div>
      )) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
            <StickyNote size={32} />
          </div>
          <div>
            <p className="font-bold text-slate-400">No notes yet</p>
            <p className="text-xs text-slate-400">Capture your brilliant ideas here</p>
          </div>
        </div>
      )}
    </div>
  </div>
);

const Settings = () => (
  <div className="space-y-8 px-4 pb-20">
    <div className="mb-4">
      <h1 className="text-3xl font-bold font-display tracking-tight">Settings</h1>
      <p className="text-slate-500 text-sm">Personalize FocusFlow</p>
    </div>

    {/* Profile Card */}
    <div className="p-6 rounded-3xl bg-white border border-slate-100 flex items-center gap-4 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border-2 border-brand-primary/10">
        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Prasun" alt="Profile" />
      </div>
      <div>
        <h3 className="font-bold text-lg text-slate-900">Prasun Jain</h3>
        <p className="text-slate-500 text-sm">prasunjain006@gmail.com</p>
      </div>
      <button className="ml-auto p-2 bg-slate-50 rounded-xl text-slate-400">
        <ChevronRight size={20} />
      </button>
    </div>

    {/* Setting Groups */}
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] px-2">Account</h3>
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
        <button className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
          <div className="p-2 bg-blue-50 text-blue-500 rounded-xl"><User size={20} /></div>
          <span className="font-medium text-slate-700">Personal Info</span>
          <ChevronRight size={18} className="ml-auto text-slate-300" />
        </button>
        <button className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
          <div className="p-2 bg-purple-50 text-purple-500 rounded-xl"><Bell size={20} /></div>
          <span className="font-medium text-slate-700">Notifications</span>
          <ChevronRight size={18} className="ml-auto text-slate-300" />
        </button>
      </div>

      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] px-2 pt-4">App</h3>
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
        <button className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
          <div className="p-2 bg-rose-50 text-rose-500 rounded-xl"><Star size={20} /></div>
          <span className="font-medium text-slate-700">Premium Plan</span>
          <ChevronRight size={18} className="ml-auto text-slate-300" />
        </button>
        <button className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
          <div className="p-2 bg-slate-50 text-slate-500 rounded-xl"><SettingsIcon size={20} /></div>
          <span className="font-medium text-slate-700">App Appearance</span>
          <ChevronRight size={18} className="ml-auto text-slate-300" />
        </button>
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [notes, setNotes] = useState<Note[]>(MOCK_NOTES);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(MOCK_SCHEDULE);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isNoteCreatorOpen, setIsNoteCreatorOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: '', show: false });

  const showToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => setToast({ message: '', show: false }), 3000);
  };

  const handleToggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    showToast('Task deleted');
  };

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    showToast('Note deleted');
  };

  const handleAddTask = (task: Task) => {
    setTasks([task, ...tasks]);
    showToast('Task added');
  };

  const handleAIAction = (type: 'task' | 'note' | 'event', data: any) => {
    if (type === 'task') {
      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        title: data.title,
        description: data.description || '',
        category: data.category || 'Personal',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        completed: false,
        priority: (data.priority as any) || 'medium',
        tags: data.tags || []
      };
      setTasks(prev => [newTask, ...prev]);
      showToast('AI created a task');
    } else if (type === 'note') {
      const colors = ['bg-blue-100', 'bg-purple-100', 'bg-amber-100', 'bg-rose-100', 'bg-emerald-100'];
      const newNote: Note = {
        id: Math.random().toString(36).substr(2, 9),
        title: data.title,
        content: data.content,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        color: colors[Math.floor(Math.random() * colors.length)],
        tags: data.tags || []
      };
      setNotes(prev => [newNote, ...prev]);
      showToast('AI saved a note');
    } else if (type === 'event') {
      const newEvent: ScheduleItem = {
        id: Math.random().toString(36).substr(2, 9),
        hour: data.hour || '12:00',
        title: data.title,
        category: data.category || 'General',
        color: 'bg-brand-primary/10 border-brand-primary/20'
      };
      setSchedule(prev => [...prev, newEvent].sort((a, b) => a.hour.localeCompare(b.hour)));
      showToast('AI scheduled an event');
    }
  };

  const filteredTasks = tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredNotes = notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSchedule = schedule.filter(s => s.title?.toLowerCase().includes(searchQuery.toLowerCase()) || !s.title);

  return (
    <div className="max-w-md mx-auto min-h-screen relative overflow-hidden flex flex-col pt-8">
      <TaskCreator 
        isOpen={isCreatorOpen} 
        onClose={() => setIsCreatorOpen(false)} 
        onAdd={handleAddTask} 
      />

      <NoteCreator
        isOpen={isNoteCreatorOpen}
        onClose={() => setIsNoteCreatorOpen(false)}
        onAdd={(note) => { setNotes([note, ...notes]); showToast('Note saved'); }}
      />

      <AIAssistant 
        isOpen={isAIOpen} 
        onClose={() => setIsAIOpen(false)} 
        onAction={handleAIAction}
      />

      {/* Global Search Bar */}
      {activeTab !== 'settings' && activeTab !== 'timer' && (
        <div className="px-4 mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`} 
              className="w-full h-12 bg-white rounded-2xl pl-11 pr-4 text-sm font-medium border border-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2"
          >
            <CheckCircle2 size={14} className="text-emerald-400" />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto px-1 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {activeTab === 'dashboard' && (
              <Dashboard 
                tasks={filteredTasks} 
                onToggleTask={handleToggleTask} 
                onOpenCreator={() => setIsCreatorOpen(true)} 
                onOpenAI={() => setIsAIOpen(true)} 
              />
            )}
            {activeTab === 'calendar' && <CalendarView schedule={filteredSchedule} />}
            {activeTab === 'timer' && <FocusTimer />}
            {activeTab === 'notes' && <Notes notes={filteredNotes} onOpenCreator={() => setIsNoteCreatorOpen(true)} />}
            {activeTab === 'settings' && <Settings />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-24 glass border-t border-slate-100 flex items-start justify-around px-2 safe-bottom z-50">
        <NavItem active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSearchQuery(''); }} icon={<LayoutDashboard size={24} />} label="Home" />
        <NavItem active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setSearchQuery(''); }} icon={<Calendar size={24} />} label="Events" />
        <NavItem active={activeTab === 'timer'} onClick={() => { setActiveTab('timer'); setSearchQuery(''); }} icon={<TimerIcon size={24} />} label="Focus" />
        <NavItem active={activeTab === 'notes'} onClick={() => { setActiveTab('notes'); setSearchQuery(''); }} icon={<StickyNote size={24} />} label="Notes" />
        <NavItem active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSearchQuery(''); }} icon={<SettingsIcon size={24} />} label="More" />
      </nav>

      <div className="fixed -top-20 -right-20 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed -bottom-20 -left-20 w-80 h-80 bg-brand-secondary/5 rounded-full blur-3xl pointer-events-none -z-10" />
    </div>
  );
}

const NavItem = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button 
    onClick={onClick}
    className="flex flex-col items-center pt-4 w-20 relative group"
  >
    <div className={`transition-all duration-300 ${active ? 'text-brand-primary' : 'text-slate-400 group-hover:text-slate-600'}`}>
      {icon}
    </div>
    <span className={`text-[10px] font-bold mt-1 uppercase tracking-tighter transition-all duration-300 ${active ? 'text-brand-primary opacity-100 translate-y-0' : 'text-slate-400 opacity-60'}`}>
      {label}
    </span>
    {active && (
      <motion.div 
        layoutId="activeTab"
        className="absolute bottom-1 w-1 h-1 bg-brand-primary rounded-full"
      />
    )}
  </button>
);
