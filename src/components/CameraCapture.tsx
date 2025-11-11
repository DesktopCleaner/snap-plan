import { useEffect, useRef, useState, useCallback } from 'react';

type Props = {
  onCapture: (blob: Blob) => void;
};

export default function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  // Store event handlers in refs so they can be cleaned up
  const eventHandlersRef = useRef<{
    handlePlaying?: () => void;
    handleError?: (e: Event) => void;
    handleLoadedMetadata?: () => void;
  }>({});

  // Function to stop the camera
  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    
    // Clear fallback timeout
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    
    // Remove event listeners
    if (video && eventHandlersRef.current) {
      if (eventHandlersRef.current.handleError) {
        video.removeEventListener('error', eventHandlersRef.current.handleError);
      }
      // loadedmetadata and playing use { once: true } so they auto-remove
    }
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    
    // Clear video source
    if (video) {
      video.srcObject = null;
    }
    
    // Clear event handlers
    eventHandlersRef.current = {};
    
    setReady(false);
    setError(null);
    setCameraActive(false);
  }, []);

  // Function to start the camera
  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsStarting(true);
    setError(null);

    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      // Get user media - try environment camera first, fallback to any camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        console.log('Got camera stream with environment facing mode');
      } catch (envError) {
        console.log('Environment camera not available, trying any camera:', envError);
        // Fallback to any available camera
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
        console.log('Got camera stream with default settings');
      }

      streamRef.current = stream;
      setCameraActive(true);

      // Define event handlers
      const handlePlaying = () => {
        console.log('Video playing event fired');
        setReady(true);
        setIsStarting(false);
      };

      const handleError = (e: Event) => {
        const target = e.target as HTMLVideoElement;
        if (target?.error && target.error.code !== MediaError.MEDIA_ERR_ABORTED) {
          console.error('Video element error:', target.error);
          setError('Video playback error');
          setIsStarting(false);
        }
      };

      const handleLoadedMetadata = () => {
        console.log('Video loadedmetadata event - readyState:', video.readyState);
        if (!video) return;
        
        // Video metadata is loaded, try to play
        if (video.paused) {
          video.play().then(() => {
            console.log('Video started playing after metadata loaded');
          }).catch(err => {
            console.log('Play after metadata failed (may retry):', err?.name);
          });
        }
        
        // Check if video is already playing
        if (video.readyState >= 2 && !video.paused) {
          setReady(true);
          setIsStarting(false);
        }
      };

      const handleLoadedData = () => {
        console.log('Video loadeddata event - dimensions:', video.videoWidth, 'x', video.videoHeight);
        if (video.paused && video.readyState >= 2) {
          video.play().catch(err => {
            console.log('Play on loadeddata failed:', err?.name);
          });
        }
      };

      // Store handlers for cleanup
      eventHandlersRef.current = {
        handlePlaying,
        handleError,
        handleLoadedMetadata,
      };

      // Clear any existing srcObject first
      if (video.srcObject) {
        video.srcObject = null;
      }
      
      // Set up event listeners BEFORE setting srcObject
      video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      video.addEventListener('loadeddata', handleLoadedData, { once: true });
      video.addEventListener('playing', handlePlaying, { once: true });
      video.addEventListener('error', handleError);
      
      // Set srcObject - this will trigger events
      console.log('Setting video srcObject to stream');
      video.srcObject = stream;

      // Wait a tiny bit for the stream to attach, then try to play
      setTimeout(() => {
        if (video && streamRef.current && video.srcObject === stream) {
          console.log('Attempting to play video after stream attachment');
          video.play().then(() => {
            console.log('Video play() succeeded after timeout');
            setReady(true);
            setIsStarting(false);
          }).catch((playError: any) => {
            console.log('Video play() failed after timeout (will wait for events):', playError?.name);
            // Events will handle it
          });
        }
      }, 100);

      // Fallback: check if video is playing after a delay
      fallbackTimeoutRef.current = setTimeout(() => {
        if (video && streamRef.current && video.srcObject === stream) {
          const state = {
            paused: video.paused,
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            srcObject: !!video.srcObject,
            currentTime: video.currentTime
          };
          console.log('Fallback check - video state:', state);
          
          // If video has dimensions and stream is active, it should be working
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            if (!video.paused) {
              // Video is playing
              setReady(true);
              setIsStarting(false);
            } else if (video.readyState >= 2) {
              // Video is ready but paused, try to play
              console.log('Video has dimensions but is paused, attempting to play');
              video.play().then(() => {
                console.log('Video started playing in fallback');
                setReady(true);
                setIsStarting(false);
              }).catch((err) => {
                console.warn('Could not play video in fallback:', err?.name);
                // Even if play fails, if we have dimensions, mark as ready
                // User might need to interact to start playback
                if (video.videoWidth > 0) {
                  setReady(true);
                  setIsStarting(false);
                }
              });
            }
          } else if (video.readyState === 0) {
            // Video hasn't loaded yet, might need more time
            console.log('Video not loaded yet, stream might still be connecting');
          } else {
            console.warn('Video element exists but has no dimensions - stream might not be providing video');
          }
        }
        fallbackTimeoutRef.current = null;
      }, 1500);
    } catch (e: any) {
      setError(e?.message || 'Camera access denied');
      setIsStarting(false);
      setCameraActive(false);
    }
  }, []);

  // Initialize camera on mount
  useEffect(() => {
    startCamera();

    // Cleanup on unmount
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (blob) onCapture(blob);
  };

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', background: '#000', borderRadius: '4px', overflow: 'hidden', minHeight: '200px' }}>
        <video 
          ref={videoRef} 
          style={{ 
            width: '100%', 
            height: 'auto',
            minHeight: '200px',
            maxHeight: '500px',
            display: cameraActive ? 'block' : 'none',
            objectFit: 'contain',
            backgroundColor: '#000',
            transform: 'scaleX(1)'
          }} 
          playsInline 
          muted 
          autoPlay
          controls={false}
          onError={(e) => {
            console.error('Video element error:', e);
            const target = e.target as HTMLVideoElement;
            if (target?.error) {
              console.error('Video error details:', {
                code: target.error.code,
                message: target.error.message,
                codeName: ['MEDIA_ERR_ABORTED', 'MEDIA_ERR_NETWORK', 'MEDIA_ERR_DECODE', 'MEDIA_ERR_SRC_NOT_SUPPORTED'][target.error.code - 1]
              });
            }
            if (!error) {
              setError('Video playback error. Please check browser console for details.');
            }
          }}
          onLoadStart={() => {
            console.log('Video loadstart event');
          }}
          onLoadedData={() => {
            console.log('Video loadeddata - dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
          }}
          onCanPlay={() => {
            console.log('Video canplay event - readyState:', videoRef.current?.readyState);
            const video = videoRef.current;
            if (video && video.paused && cameraActive && video.readyState >= 2) {
              video.play().catch(err => {
                console.log('Play on canplay failed:', err?.name, err?.message);
              });
            }
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            console.log('Video loadedmetadata - dimensions:', video?.videoWidth, 'x', video?.videoHeight, 'readyState:', video?.readyState);
            // Force a play attempt when metadata is loaded
            if (video && cameraActive && video.paused) {
              setTimeout(() => {
                video.play().catch(err => console.log('Play after metadata timeout:', err?.name));
              }, 50);
            }
          }}
          onPlaying={() => {
            console.log('Video playing event - video is now playing!');
          }}
        />
        {!cameraActive && (
          <div style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '40px', 
            color: '#999', 
            textAlign: 'center',
            backgroundColor: '#000'
          }}>
            Camera is off
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleCapture} disabled={!ready || !cameraActive}>
          {ready && cameraActive ? 'Capture Photo' : isStarting ? 'Starting camera…' : 'Camera Off'}
        </button>
        <button 
          onClick={() => {
            if (cameraActive) {
              stopCamera();
            } else {
              startCamera();
            }
          }}
          disabled={isStarting}
          style={{ 
            backgroundColor: cameraActive ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none'
          }}
        >
          {cameraActive ? 'Turn Camera Off' : 'Turn Camera On'}
        </button>
      </div>
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
    </div>
  );
}

