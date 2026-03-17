'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

interface ChatPageLayoutProps {
  leftPanel: ReactNode; // PDF sidebar
  rightPanel: ReactNode; // Main chat panel
}

export function ChatPageLayout({ leftPanel, rightPanel }: ChatPageLayoutProps) {
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && wrapperRef.current) {
        await wrapperRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.warn('Fullscreen mode is not available:', error);
    }
  };

  return (
    <>
      <div
        ref={wrapperRef}
        className={[
          'hidden lg:flex gap-5 rounded-3xl bg-background',
          isFullscreen
            ? 'h-screen w-screen p-4'
            : 'min-h-[82vh] h-[calc(100vh-180px)]',
        ].join(' ')}
      >
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm lg:shadow-md">
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="rounded-full bg-background/95 backdrop-blur"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="mr-2 h-4 w-4" />
                  Quitter le plein écran
                </>
              ) : (
                <>
                  <Maximize2 className="mr-2 h-4 w-4" />
                  Plein écran
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPdfOpen((prev) => !prev)}
              className="rounded-full bg-background/95 backdrop-blur"
            >
              {isPdfOpen ? (
                <>
                  <PanelRightClose className="mr-2 h-4 w-4" />
                  Masquer le PDF
                </>
              ) : (
                <>
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  Afficher le PDF
                </>
              )}
            </Button>
          </div>
          {rightPanel}
        </div>

        {isPdfOpen && (
          <aside
            className={[
              'min-h-0 overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200',
              isFullscreen ? 'w-[460px]' : 'w-[420px]',
            ].join(' ')}
          >
            {leftPanel}
          </aside>
        )}
      </div>

      <Tabs defaultValue="chat" className="lg:hidden">
        <div className="mb-4 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="document" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Document
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
            </TabsList>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            className="shrink-0 rounded-full"
            aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        <TabsContent value="document" className="mt-0">
          <div className="overflow-hidden rounded-2xl border bg-card h-[calc(100vh-220px)]">
            {leftPanel}
          </div>
        </TabsContent>
        <TabsContent value="chat" className="mt-0">
          <div className="overflow-hidden rounded-2xl border bg-card h-[calc(100vh-220px)]">
            {rightPanel}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
