
import React, { useState, useCallback, ChangeEvent } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

// Augment the window type to include JSZip and saveAs from the CDNs
declare global {
  interface Window {
    JSZip: any;
    saveAs: (blob: Blob, filename:string) => void;
  }
}

export interface ProjectFiles {
  'firebase/google-services.json': string;
  'res/drawable/app_icon.xml': string;
  'res/drawable/item1_icon.xml': string;
  'res/drawable/item2_icon.xml': string;
  'res/drawable/settings.xml': string;
  'tree/app.easy': string;
}

// --- Helper Functions & Components ---

// Helper to convert a File object to a Gemini API-compatible Part object.
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};


const Loader: React.FC = () => (
  <div className="flex flex-col items-center justify-center space-y-4">
    <svg className="animate-spin h-10 w-10 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <p className="text-lg text-gray-300">Building your project files... This may take a moment.</p>
  </div>
);

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}
const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 whitespace-nowrap ${
      isActive
        ? 'bg-green-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`}
  >
    {label}
  </button>
);

interface CodeDisplayProps {
    code: string;
    language: string;
}
const CodeDisplay: React.FC<CodeDisplayProps> = ({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden relative border border-gray-700">
            <div className="flex justify-between items-center px-4 py-2 bg-gray-700/50">
                <span className="text-xs font-mono text-green-400 uppercase">{language}</span>
                <button
                    onClick={handleCopy}
                    className="px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 bg-gray-600 text-gray-200 hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
                >
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="p-4 text-sm text-left overflow-x-auto text-white">
                <code>{code}</code>
            </pre>
        </div>
    );
};

// --- Main Application Component ---

const App: React.FC = () => {
  const [appName, setAppName] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [appIcon, setAppIcon] = useState<File | null>(null);
  const [appIconPreview, setAppIconPreview] = useState<string | null>(null);
  const [admobId, setAdmobId] = useState<string>('');
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<ProjectFiles | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof ProjectFiles | null>(null);

  const fileOrder: (keyof ProjectFiles)[] = [
    'tree/app.easy',
    'firebase/google-services.json',
    'res/drawable/app_icon.xml',
    'res/drawable/item1_icon.xml',
    'res/drawable/item2_icon.xml',
    'res/drawable/settings.xml',
  ];

  const fileLabels: Record<keyof ProjectFiles, string> = {
    'tree/app.easy': 'app.easy',
    'firebase/google-services.json': 'google-services.json',
    'res/drawable/app_icon.xml': 'app_icon.xml',
    'res/drawable/item1_icon.xml': 'item1_icon.xml',
    'res/drawable/item2_icon.xml': 'item2_icon.xml',
    'res/drawable/settings.xml': 'settings.xml',
  };

  const generateProject = useCallback(async (userPrompt: string, appName: string, files: File[], appIconFile: File, admobAppId: string) => {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const fileContents = await Promise.all(
        files.map(file => 
          new Promise<{ name: string; content: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                resolve({ name: file.name, content: reader.result });
              } else {
                reject(new Error('Failed to read file as text.'));
              }
            };
            reader.onerror = reject;
            reader.readAsText(file);
          })
        )
      );
    
      let referenceFilesPromptSection = '';
      if (fileContents.length > 0) {
          referenceFilesPromptSection = '\n\n--- REFERENCE FILES ---\nThe user has provided the following files as a reference. Use their content, style, and structure to guide your generation.\n';
          for (const file of fileContents) {
              referenceFilesPromptSection += `\nFile: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n`;
          }
          referenceFilesPromptSection += '--- END REFERENCE FILES ---';
      }

    const fullPrompt = `
      You are an expert system for a special mobile app framework.
      Your task is to generate a complete set of configuration and resource files for an application based on the user's request.
      The output MUST be a single JSON object where keys are the full file paths and values are the string content for each file, matching the schema provided.

      The user has provided an app name: "${appName}". This name should be used where appropriate.
      The user has provided an AdMob App ID: "${admobAppId}". Include this in the 'app.easy' file.

      Please generate the content for the following files:

      1. 'firebase/google-services.json': A placeholder google-services.json file. Use placeholder values for project IDs and keys, but the structure must be correct. Include a "project_info" with "project_id" like "${appName.toLowerCase().replace(/\s/g, '-')}-project" and a client object.
      2. 'res/drawable/app_icon.xml': An Android Vector Drawable XML file for the app's icon. The user has uploaded a reference image. Create a simplified, abstract, and iconic vector drawable that captures the essence of this image.
      3. 'res/drawable/item1_icon.xml': An Android Vector Drawable XML for an icon related to the primary feature of the app.
      4. 'res/drawable/item2_icon.xml': An Android Vector Drawable XML for another icon related to a secondary feature or action in the app.
      5. 'res/drawable/settings.xml': An Android Vector Drawable XML, specifically a 'shape' drawable that can be used as a background. Create a simple rectangle shape with rounded corners and a solid color.
      6. 'tree/app.easy': This is a custom JSON configuration file that defines the UI and logic. The content for this file MUST be a valid JSON string.
          - The root of the JSON must be an object.
          - It must have an "appName": "${appName}".
          - It must have an "appVersion": "1.0.0".
          - It must have a "startScreen" property, indicating the name of the first screen to show.
          - It should have a "toolbar" object with a "title" and an optional "menu" array for toolbar actions.
          - It must have an "admobAppId" property with the exact value provided by the user.
          - It must have a "screens" property, which is an array of screen objects. Generate at least two logical screens based on the user's request (e.g., a main list screen and a detail/add screen).
          - Each screen object must have "name", "title", and "widgets" properties.
          - The "widgets" property is an array of widget objects.
          - The root object must have an "actions" property, an array of action objects. Include "navigate" actions to move between the screens you create.
          - Example structure:
            {
              "appName": "${appName}",
              "appVersion": "1.0.0",
              "startScreen": "main",
              "admobAppId": "${admobAppId}",
              "toolbar": {
                "title": "${appName}",
                "menu": [{"id": "settings_action", "icon": "settings", "action": "openSettings"}]
              },
              "screens": [
                { "name": "main", "title": "Main", "widgets": [{"type": "button", "text": "Go to Settings", "action": "openSettings"}] },
                { "name": "settings", "title": "Settings", "widgets": [{"type": "label", "text": "Settings Page"}] }
              ],
              "actions": [
                { "id": "openSettings", "type": "navigate", "screen": "settings" }
              ]
            }

      User's app feature description: "${userPrompt}"
      ${referenceFilesPromptSection}
    `;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        'firebase/google-services.json': { type: Type.STRING },
        'res/drawable/app_icon.xml': { type: Type.STRING },
        'res/drawable/item1_icon.xml': { type: Type.STRING },
        'res/drawable/item2_icon.xml': { type: Type.STRING },
        'res/drawable/settings.xml': { type: Type.STRING },
        'tree/app.easy': { type: Type.STRING },
      },
      required: [
        'firebase/google-services.json',
        'res/drawable/app_icon.xml',
        'res/drawable/item1_icon.xml',
        'res/drawable/item2_icon.xml',
        'res/drawable/settings.xml',
        'tree/app.easy',
      ],
    };

    const textPart = { text: fullPrompt };
    const imagePart = await fileToGenerativePart(appIconFile);
    const requestParts = [textPart, imagePart];
   
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: { parts: requestParts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const jsonString = response.text.trim();
    return JSON.parse(jsonString) as ProjectFiles;
  }, []);
  
  const handleAppIconChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAppIcon(file);
      setAppIconPreview(URL.createObjectURL(file));
    }
     e.target.value = ''; // Allow re-selecting the same file
  };
  
  const handleRemoveAppIcon = () => {
    if (appIconPreview) {
      URL.revokeObjectURL(appIconPreview);
    }
    setAppIcon(null);
    setAppIconPreview(null);
  };

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        setReferenceFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files)]);
        event.target.value = '';
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setReferenceFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
  };


  const handleGenerate = async () => {
    if (!appName.trim()) {
      setError("Please provide a name for your app.");
      return;
    }
    if (!prompt.trim()) {
      setError("Please describe the features of the app you want to build.");
      return;
    }
    if (!appIcon) {
      setError("Please upload an app icon.");
      return;
    }
    if (!admobId.trim()) {
      setError("Please provide an AdMob App ID.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedFiles(null);

    try {
      // The appIcon check above ensures it's not null here
      const files = await generateProject(prompt, appName, referenceFiles, appIcon, admobId);
      setGeneratedFiles(files);
      setActiveTab('tree/app.easy');
    } catch (e: any) {
      console.error(e);
      setError(`Failed to generate project: ${e.message || 'An unknown error occurred.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadProject = useCallback(() => {
    if (!generatedFiles) return;

    try {
      const zip = new window.JSZip();
      const appNameSlug = appName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || "generated_app";
      
      for (const [path, content] of Object.entries(generatedFiles)) {
          zip.file(path, content);
      }
      
      zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
        window.saveAs(content, `${appNameSlug}.zip`);
      }).catch((err: any) => {
        console.error("Failed to generate zip file:", err);
        setError("Could not create the zip file for download. Please try again.");
      });
    } catch (e: any) {
      console.error("Error during zip creation process:", e);
      setError(`An unexpected error occurred while preparing the download: ${e.message}`);
    }
  }, [generatedFiles, appName]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
            AI App Builder
          </h1>
          <p className="mt-4 text-lg text-gray-400">Describe your app, and I'll generate all the necessary configuration and resource files for you.</p>
        </header>

        <main>
          <div className="bg-gray-800/50 p-6 rounded-xl shadow-2xl border border-gray-700">
            <div className="flex flex-col space-y-6">
              <div>
                <label htmlFor="appName" className="text-lg font-medium text-gray-200 mb-2 block">
                  App Name
                </label>
                <input
                  id="appName"
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g., My Awesome Note Taker"
                  className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow"
                  aria-label="App Name Input"
                />
              </div>

              <div>
                <label htmlFor="prompt" className="text-lg font-medium text-gray-200 mb-2 block">
                  App Feature Description
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A simple note-taking app where users can add new notes to a list and clear the list."
                  className="w-full h-32 p-4 bg-gray-900 border border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow"
                  aria-label="App Description Input"
                />
              </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-lg font-medium text-gray-200 mb-2 block">App Icon</label>
                        {appIconPreview ? (
                            <div className="flex items-center gap-3">
                                <img src={appIconPreview} alt="App icon preview" className="w-16 h-16 rounded-lg object-cover border-2 border-gray-600" />
                                <button onClick={handleRemoveAppIcon} className="p-1 text-gray-500 hover:text-red-400 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500" aria-label="Remove app icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        ) : (
                             <label className="cursor-pointer w-full flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 bg-gray-700 text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.414l-1.293 1.293a1 1 0 01-1.414-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L13 9.414V13h-1.5a.5.5 0 010-1H13V8.5A3.5 3.5 0 009.5 5 3 3 0 006.5 8H7a.5.5 0 010 1h-.5V13z" /></svg>
                                <span>Upload Icon</span>
                                <input id="app-icon-upload" type="file" className="sr-only" accept="image/*" onChange={handleAppIconChange} />
                            </label>
                        )}
                    </div>
                     <div>
                        <label htmlFor="admobId" className="text-lg font-medium text-gray-200 mb-2 block">AdMob App ID</label>
                        <input
                            id="admobId"
                            type="text"
                            value={admobId}
                            onChange={(e) => setAdmobId(e.target.value)}
                            placeholder="e.g., ca-app-pub-..."
                            className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow"
                            aria-label="AdMob App ID Input"
                        />
                    </div>
                </div>

              <div>
                <label htmlFor="file-upload" className="text-lg font-medium text-gray-200 mb-2 block">
                  Reference Files (Optional)
                </label>
                <div className="mt-2 flex items-center gap-4">
                    <label className="cursor-pointer px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 bg-gray-700 text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500">
                        <span>Select Files</span>
                        <input id="file-upload" type="file" className="sr-only" multiple onChange={handleFilesChange} />
                    </label>
                    <p className="text-sm text-gray-500">Attach files to provide context for the AI.</p>
                </div>
                {referenceFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <ul className="space-y-2">
                            {referenceFiles.map((file, index) => (
                                <li key={index} className="flex items-center justify-between bg-gray-900/50 p-2 rounded-md border border-gray-700 animate-fade-in">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                        </svg>
                                        <span className="text-sm text-gray-300 truncate" title={file.name}>{file.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveFile(index)}
                                        className="p-1 text-gray-500 hover:text-red-400 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500"
                                        aria-label={`Remove ${file.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
              </div>

              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="w-full sm:w-auto self-end px-8 py-3 font-bold text-white bg-gradient-to-r from-green-500 to-blue-600 rounded-lg hover:from-green-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500"
              >
                {isLoading ? 'Generating...' : 'Build My App'}
              </button>
            </div>
          </div>

          <div className="mt-10">
            {isLoading && <Loader />}
            {error && <div className="bg-red-900/50 text-red-300 border border-red-700 p-4 rounded-lg text-center" role="alert">{error}</div>}

            {generatedFiles && activeTab && (
              <div className="bg-gray-800/50 p-6 rounded-xl shadow-2xl border border-gray-700 animate-fade-in">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                  <h2 className="text-2xl font-bold text-gray-100">Generated Project Files</h2>
                  <button
                    onClick={downloadProject}
                    className="px-6 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors duration-200 flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500"
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Download Project (.zip)</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-700 pb-2">
                  {fileOrder
                    .filter(filename => generatedFiles[filename] !== undefined)
                    .map((filename) => (
                      <TabButton
                        key={filename}
                        label={fileLabels[filename]}
                        isActive={activeTab === filename}
                        onClick={() => setActiveTab(filename)}
                      />
                  ))}
                </div>

                <div>
                  <CodeDisplay code={generatedFiles[activeTab]} language={activeTab.split('.').pop() || ''} />
                </div>
              </div>
            )}
          </div>
        </main>
        <footer className="text-center mt-10 text-gray-600 text-sm">
            <p>Built with Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
