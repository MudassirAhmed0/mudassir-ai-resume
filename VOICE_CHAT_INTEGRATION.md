# Voice Chat Integration

This document explains the new VoiceChat component that has been integrated into the Mudassir AI Resume project.

## Overview

The VoiceChat component provides a modern, voice-first interface for interacting with the AI assistant. It features:

- **Large Avatar with Energy Ring**: Visual feedback showing the current voice state
- **State Indicators**: Clear visual cues for listening, thinking, speaking, and idle states
- **Transcript Display**: Real-time conversation history
- **Voice Controls**: Simple mic toggle for speech input
- **Text Fallback**: Optional text input for accessibility

## Files Added/Modified

### New Files

- `src/components/VoiceChat.tsx` - Main voice chat component
- `src/hooks/useSimpleSTT.ts` - Simplified speech-to-text hook
- `src/app/voice-chat/page.tsx` - Demo page showcasing the voice chat

### Modified Files

- `src/app/page.tsx` - Added link to voice chat mode

## Usage

### Basic Usage

```tsx
import VoiceChat from "@/components/VoiceChat";

function MyPage() {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);

  const handleSendText = async (text: string) => {
    // Handle sending text to AI and getting response
    // Update messages and isThinking state
  };

  return (
    <VoiceChat
      messages={messages}
      isThinking={isThinking}
      avatarUrl="/your-avatar.jpg"
      onSendText={handleSendText}
    />
  );
}
```

### Props

- `messages?: ChatMessage[]` - Array of conversation messages
- `isThinking?: boolean` - Whether AI is currently generating a response
- `avatarUrl?: string` - Path to avatar image (defaults to "/mudassir.jpeg")
- `defaultShowComposer?: boolean` - Whether to show text input by default
- `onSendText?: (text: string) => void` - Callback for handling text input

### ChatMessage Type

```tsx
type ChatMessage = {
  id?: string | number;
  role: "user" | "assistant" | "system";
  content: string;
};
```

## Voice States

The component displays different visual states:

- **Idle**: Gray ring, "Ready" chip
- **Listening**: Green ring with animation, "Listening" chip
- **Thinking**: Blue ring with animation, "Thinking" chip
- **Speaking**: Orange/red ring with animation, "Speaking" chip

## Integration Notes

- The component uses the existing `speaker` instance for TTS
- Speech recognition is handled by the simplified `useSimpleSTT` hook
- The component is designed to be prop-driven for easy integration
- All existing functionality (settings, voice modes, etc.) remains unchanged

## Demo

Visit `/voice-chat` to see the component in action with a working demo that integrates with the existing AI chat API.

## Browser Support

- Requires modern browsers with Speech Recognition API support
- Chrome/Edge: Full support
- Safari: Limited support
- Firefox: No support (will gracefully degrade to text-only mode)
