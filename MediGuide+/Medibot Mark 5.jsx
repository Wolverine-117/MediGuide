import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Camera, 
  MessageCircle, 
  X, 
  Upload, 
  ChevronRight, 
  AlertTriangle, 
  Activity, 
  Pill, 
  ShieldAlert, 
  FileText,
  Send,
  Loader2,
  Menu,
  Stethoscope,
  Moon,
  Sun,
  Aperture
} from 'lucide-react';

/* --- GEMINI API HELPERS --- */

const SYSTEM_PROMPT = `
You are MediBot, a medical information AI assistant. 

CORE RESPONSIBILITIES:

1. SEARCH SUGGESTIONS
- Return STRICT JSON Array: [{"name": "Brand", "generic": "Generic"}]

2. MEDICINE DETAILS (From Text Search OR Image Analysis)
- Trigger: User selects medicine OR uploads/captures image.
- Action: Identify medicine and provide comprehensive details.
- Output: STRICT JSON Object:
  {
    "name": "Medicine Name",
    "genericName": "Generic/Scientific name",
    "activeIngredients": "List of active ingredients with quantities",
    "indications": "Medical uses and conditions it treats",
    "dosageForms": "Available forms and strengths",
    "commonSideEffects": "List of common side effects",
    "contraindications": "Conditions/situations when NOT to use",
    "manufacturer": "Known manufacturers",
    "priceRange": "Approx. price (INR/USD)",
    "warnings": "Important warnings",
    "alternatives": ["Alt 1", "Alt 2", "Alt 3"]
  }

3. CHATBOT
- Safety: ALWAYS include disclaimers. NEVER diagnose.
- Output: Plain text.

CRITICAL: 
- If an image is provided, recognize the medicine package/pill and return the full detailed JSON object for this medicine (name, ingredients, sideEffects, etc) as per the schema. If not a medicine, return empty JSON.
`;

const callGeminiAPI = async (prompt, imageBase64 = null, jsonMode = false) => {
  // NOTE: If running this application outside of the provided environment, 
  // insert your actual Gemini API key here.
  const apiKey = ""; // Injected by environment (or insert your key if running locally)
  
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
  const url = `${baseUrl}?key=${apiKey}`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: prompt },
        ...(imageBase64 ? [{ inlineData: { mimeType: "image/png", data: imageBase64 } }] : [])
      ]
    }
  ];

  const payload = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: jsonMode ? { responseMimeType: "application/json" } : {}
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Use an exponential backoff retry mechanism (omitted for brevity in this simple demo)
    return null;
  }
};

/* --- COMPONENTS --- */

const Logo = () => (
  <div className="flex items-center gap-2">
    <div className="bg-emerald-600 p-1 rounded-lg">
      <Stethoscope className="w-6 h-6 text-white" />
    </div>
    <span className="text-2xl font-bold text-slate-800 dark:text-emerald-400 tracking-tight">MediBot</span>
  </div>
);

const DetailCard = ({ icon: Icon, title, content, warning = false }) => (
  <div className={`p-5 rounded-xl border shadow-sm transition-all hover:shadow-md
    ${warning 
      ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-500/30' 
      : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
    }`}>
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-5 h-5 ${warning ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
      <h3 className={`font-bold ${warning ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'}`}>{title}</h3>
    </div>
    <p className={`text-sm leading-relaxed ${warning ? 'text-red-800 dark:text-red-200' : 'text-slate-600 dark:text-slate-300'}`}>
      {content || "Information not available"}
    </p>
  </div>
);

const ChatMessage = ({ msg }) => (
  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
    <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
      msg.role === 'user' 
        ? 'bg-emerald-600 text-white rounded-br-none' 
        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-bl-none'
    }`}>
      <p className="text-sm leading-relaxed">{msg.text}</p>
    </div>
  </div>
);

/* --- MAIN APP --- */

export default function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // App State
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', text: "Hello! I'm MediBot. Ask me medical questions, search for medicines, or scan a package for details." }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Scanner/Camera State
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Toggle Theme
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Debounced Search Suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 3) {
        setSuggestions([]);
        return;
      }
      setLoadingSuggestions(true);
      const prompt = `User search query: "${query}". Return JSON array of medicine suggestions only.`;
      const result = await callGeminiAPI(prompt, null, true);
      if (result) {
        try {
          const parsed = JSON.parse(result);
          setSuggestions(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          console.error("Parse error", e);
        }
      }
      setLoadingSuggestions(false);
    };

    const timeoutId = setTimeout(fetchSuggestions, 600);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle Medicine Selection (Text Search)
  const handleSelectMedicine = async (medicineName) => {
    setQuery(medicineName);
    setSuggestions([]);
    setLoading(true);
    setSelectedMedicine(null);

    const prompt = `User selected medicine: "${medicineName}". Provide comprehensive details in the specified JSON format.`;
    const result = await callGeminiAPI(prompt, null, true);
    
    if (result) {
      try {
        const data = JSON.parse(result);
        if (data.name) setSelectedMedicine(data);
      } catch (e) {
        console.error("Details parse error", e);
      }
    }
    setLoading(false);
  };

  // Handle Image Analysis (Upload or Camera)
  const processImage = async (base64Data) => {
    setShowScannerModal(false);
    stopCamera();
    setLoading(true);
    setSelectedMedicine(null);

    const prompt = "Analyze this image. Identify the medicine. If found, return the full detailed JSON object for this medicine (name, ingredients, sideEffects, etc) as per the schema. If not a medicine, return empty JSON.";
    
    const result = await callGeminiAPI(prompt, base64Data, true);
    
    if (result) {
      try {
        const data = JSON.parse(result);
        if (data.name) {
          setSelectedMedicine(data);
        } else {
          // Use a message box instead of alert()
          setChatHistory(prev => [...prev, { role: 'assistant', text: "I couldn't identify a medicine package in that image. Please ensure the label is clear and try again." }]);
          setIsChatOpen(true);
        }
      } catch (e) {
        console.error("Image parse error", e);
        setChatHistory(prev => [...prev, { role: 'assistant', text: "Error analyzing image data. The AI may have returned an unexpected format. Please try again." }]);
        setIsChatOpen(true);
      }
    } else {
       setChatHistory(prev => [...prev, { role: 'assistant', text: "A communication error occurred with the AI. Please check your connection and try again." }]);
       setIsChatOpen(true);
    }
    setLoading(false);
  };

  // Handle File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      processImage(base64Data);
    };
    reader.readAsDataURL(file);
  };

  // Camera Functions
  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      // Request 'environment' (rear) camera for mobile devices
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play(); // Start playing the video stream
      }
    } catch (err) {
      console.error("Camera Error", err);
      // Use a message box instead of alert()
      setChatHistory(prev => [...prev, { role: 'assistant', text: "Unable to access your device's camera. Please check your browser permissions." }]);
      setIsChatOpen(true);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Calculate aspect ratio to prevent stretching
      const aspectRatio = video.videoWidth / video.videoHeight;
      canvas.width = 400; // Fixed width for analysis
      canvas.height = 400 / aspectRatio; 

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL('image/png').split(',')[1];
      processImage(base64Data);
    }
  };

  // Handle Chat
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newHistory = [...chatHistory, { role: 'user', text: chatInput }];
    setChatHistory(newHistory);
    setChatInput('');
    setChatLoading(true);

    const prompt = `User Question: "${chatInput}". Previous Context: ${JSON.stringify(chatHistory.slice(-2))}. Answer accurately but concisely with safety disclaimers.`;
    const response = await callGeminiAPI(prompt, null, false);
    
    setChatHistory(prev => [...prev, { role: 'assistant', text: response || "I'm sorry, I couldn't process that request right now." }]);
    setChatLoading(false);
  };

  return (
    <div className={`${isDarkMode ? 'dark' : ''}`}>
      <div className="min-h-screen transition-colors duration-300 bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/30">
        
        {/* HEADER */}
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0f172a]/95 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <Logo />
            
            <nav className="hidden md:flex items-center gap-4">
               <button 
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <button onClick={() => {setSelectedMedicine(null); setQuery('')}} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>
              
              <a 
                href="https://www.google.com/maps/search/nearby+medical+shops" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                <span>Nearby Shops</span>
              </a>

              <button 
                onClick={() => setShowScannerModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-emerald-50 dark:bg-transparent hover:bg-emerald-100 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 transition-colors font-medium"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Medicine</span>
              </button>
            </nav>
            
            {/* Mobile Actions */}
            <div className="flex items-center gap-2 md:hidden">
              <button onClick={toggleTheme} className="p-2 text-slate-600 dark:text-slate-300">
                {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
              </button>
              <button onClick={() => setShowScannerModal(true)} className="p-2 text-emerald-600 dark:text-emerald-400">
                <Camera className="w-6 h-6" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-12 pb-24">
          
          {/* HERO SECTION */}
          {!selectedMedicine && !loading && (
            <div className="text-center mb-16 fade-in">
              <h1 className="text-4xl md:text-6xl font-bold mb-6 text-slate-900 dark:text-white">
                Find <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">Medicine</span> Info
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-12">
                Instantly identify medicines by name or photo. Get dosages, side effects, and safe alternatives powered by AI.
              </p>

              {/* SEARCH BAR */}
              <div className="relative max-w-3xl mx-auto group">
                <div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full group-hover:bg-emerald-500/20 transition-all"></div>
                <div className="relative flex items-center bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl dark:shadow-none overflow-hidden focus-within:border-emerald-500/50 transition-colors">
                  <Search className="w-6 h-6 text-slate-400 ml-6" />
                  <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search medicine (e.g., Dolo, Amoxicillin)..."
                    className="w-full bg-transparent border-none px-6 py-5 text-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-0"
                  />
                  {loadingSuggestions && (
                    <div className="pr-6">
                      <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                    </div>
                  )}
                </div>

                {/* SUGGESTIONS DROPDOWN */}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden z-30 animate-in fade-in slide-in-from-top-2">
                    {suggestions.map((drug, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectMedicine(drug.name)}
                        className="w-full flex flex-col items-start px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800/50 last:border-0 transition-colors text-left"
                      >
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{drug.name}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{drug.generic}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* QUICK ACTIONS */}
              <div className="flex flex-wrap justify-center gap-3 mt-12">
                 {['Paracetamol', 'Ibuprofen', 'Cetirizine', 'Aspirin'].map((med) => (
                   <button 
                     key={med}
                     onClick={() => handleSelectMedicine(med)}
                     className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-500 transition-colors shadow-sm"
                   >
                     {med}
                   </button>
                 ))}
              </div>
            </div>
          )}

          {/* LOADING STATE */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
                <Loader2 className="relative w-16 h-16 text-emerald-500 animate-spin" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-6 animate-pulse font-medium">Analyzing medical database...</p>
            </div>
          )}

          {/* MEDICINE DETAILS VIEW */}
          {selectedMedicine && !loading && (
            <div className="animate-in slide-in-from-bottom-8 fade-in duration-500">
               <button 
                 onClick={() => {setSelectedMedicine(null); setQuery('');}}
                 className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
               >
                 <X className="w-4 h-4" /> Back to Search
               </button>

               <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
                  <div className="flex flex-col md:flex-row justify-between md:items-start gap-6 mb-8 border-b border-slate-100 dark:border-slate-700 pb-8">
                    <div>
                      <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">{selectedMedicine.name}</h2>
                      <p className="text-emerald-600 dark:text-emerald-400 text-lg font-medium">{selectedMedicine.genericName}</p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {selectedMedicine.manufacturer}
                        </span>
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {selectedMedicine.priceRange}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-full border border-emerald-100 dark:border-emerald-500/20">
                      <Activity className="w-5 h-5" />
                      <span className="font-bold">Verified Info</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DetailCard icon={Pill} title="Indications (Uses)" content={selectedMedicine.indications} />
                    <DetailCard icon={Activity} title="Active Ingredients" content={selectedMedicine.activeIngredients} />
                    <DetailCard icon={FileText} title="Dosage Forms" content={selectedMedicine.dosageForms} />
                    <DetailCard icon={AlertTriangle} title="Side Effects" content={selectedMedicine.commonSideEffects} warning />
                    <DetailCard icon={ShieldAlert} title="Contraindications" content={selectedMedicine.contraindications} warning />
                    <DetailCard icon={AlertTriangle} title="Warnings" content={selectedMedicine.warnings} />
                  </div>

                  {selectedMedicine.alternatives?.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700">
                      <h3 className="text-slate-500 dark:text-slate-400 font-bold mb-4 text-xs uppercase tracking-wider">Known Alternatives</h3>
                      <div className="flex flex-wrap gap-3">
                        {selectedMedicine.alternatives.map((alt, i) => (
                          <button key={i} onClick={() => handleSelectMedicine(alt)} className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                            {alt} <ChevronRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
               </div>
            </div>
          )}

        </main>

        {/* FLOATING CHAT BUTTON */}
        <div className="fixed bottom-6 right-6 z-50">
          {!isChatOpen ? (
            <button 
              onClick={() => setIsChatOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-full shadow-lg shadow-emerald-500/30 transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
            >
              <MessageCircle className="w-7 h-7" />
            </button>
          ) : (
            <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-[90vw] md:w-[400px] h-[500px] flex flex-col animate-in slide-in-from-bottom-10 fade-in">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-lg">
                    <Stethoscope className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white">MediBot Assistant</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Always consult a doctor</p>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-[#0f172a]/50">
                {chatHistory.map((msg, i) => (
                  <ChatMessage key={i} msg={msg} />
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-700 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a medical question..."
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button 
                    type="submit"
                    disabled={chatLoading}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* SCANNER MODAL (Camera + Upload) */}
        {showScannerModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 shadow-2xl relative overflow-hidden">
              <button 
                onClick={() => {
                  setShowScannerModal(false);
                  stopCamera();
                }}
                className="absolute top-4 right-4 z-10 p-1 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Scan Medicine</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                Identify medicine by taking a photo or uploading an image.
              </p>
              
              {!isCameraActive ? (
                <div className="grid grid-cols-2 gap-4">
                  {/* Option 1: Camera */}
                  <button 
                    onClick={startCamera}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-all group"
                  >
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                      <Aperture className="w-8 h-8 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Take Photo</span>
                  </button>

                  {/* Option 2: Upload */}
                  <div className="relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-all group cursor-pointer">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                      <Upload className="w-8 h-8 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Upload Image</span>
                  </div>
                </div>
              ) : (
                <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4]">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                  <canvas ref={canvasRef} className="hidden"></canvas>
                  
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                     <button 
                      onClick={stopCamera}
                      className="p-3 rounded-full bg-slate-800/80 text-white backdrop-blur-sm"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={capturePhoto}
                      className="p-4 rounded-full bg-white border-4 border-emerald-500 shadow-lg transform active:scale-95 transition-transform"
                    >
                      <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}