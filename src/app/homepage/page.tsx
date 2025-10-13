'use client'
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Particles } from "@/components/ui/particles";
import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { Globe, Mic, Bot, ArrowRight, Zap } from "lucide-react";

export default function HomePage() {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [crawlingStatus, setCrawlingStatus] = useState("");

    const startVoiceChat = async () => {
        if (!url.trim()) {
            alert("Please enter a valid URL to analyze");
            return;
        }

        setIsLoading(true);
        setCrawlingStatus("Validating URL...");

        // Add URL validation
        try {
            new URL(url);

            // Start crawling process
            setCrawlingStatus("Crawling website content...");

            // TODO: Replace with your actual API endpoint
            const response = await fetch('http://localhost:8000', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            if (response.ok) {
                const data = await response.json();
                setCrawlingStatus("Analysis complete! Redirecting...");

                // Redirect to chatbox with crawled data
                setTimeout(() => {
                    location.href = `/chatbox?url=${encodeURIComponent(url)}&data=${encodeURIComponent(JSON.stringify(data))}`;
                }, 1000);
            } else {
                throw new Error('Failed to crawl website');
            }

        } catch (error) {
            console.error('Error:', error);
            alert("Failed to analyze website. Please check the URL and try again.");
            setIsLoading(true);
            setCrawlingStatus("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            startVoiceChat();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
            {/* Background Effects */}
            <Particles
                size={2}
                className="absolute inset-0 opacity-50"
            />

            {/* Main Content */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mx-auto text-center space-y-8">

                    {/* Loading State with Lottie Animation */}
                    {isLoading && (
                        <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center">
                            <div className="text-center space-y-6">
                                {/* Lottie Animation Container */}
                                <div className="flex justify-center mb-8">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-gradient-to-r rounded-3xl blur-2xl"></div>
                                        <div className="relative backdrop-blur-sm border border-gray-200/50 rounded-3xl p-6 max-w-lg">
                                            <video
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                className="w-full h-auto rounded-2xl"
                                            >
                                                <source src="/crab walk.webm" type="video/webm" />
                                            </video>
                                        </div>
                                    </div>
                                </div>

                                {/* Loading Status */}
                                <div className="space-y-4">
                                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                                        Analyzing Website
                                    </h2>
                                    <p className="text-lg text-gray-700">
                                        {crawlingStatus || "Preparing to crawl..."}
                                    </p>

                                    {/* Progress Indicator */}
                                    <div className="w-64 mx-auto">
                                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"></div>
                                        </div>
                                    </div>

                                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                                        we are crawling and analyzing the website content.
                                        This may take a few moments depending on the site size.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hero Section */}
                    <div className="space-y-6">

                        <div className="flex items-center justify-center space-x-3 mb-6">
                            <div className="p-3 bg-purple-600/20 rounded-full backdrop-blur-sm border border-purple-500/30 animate-pulse">
                                <Mic className="w-8 h-8 text-purple-400" />
                            </div>
                            <div className="p-3 bg-blue-600/20 rounded-full backdrop-blur-sm border border-blue-500/30">
                                <Bot className="w-8 h-8 text-blue-400" />
                            </div>
                            <div className="p-3 bg-green-600/20 rounded-full backdrop-blur-sm border border-green-500/30">
                                <Globe className="w-8 h-8 text-green-400" />
                            </div>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
                            Voice AI Agent for
                            <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-green-400 bg-clip-text text-transparent">
                                {" "}Any Website
                            </span>
                        </h1>

                        <p className="text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
                            Enter any website URL and have natural voice conversations about its content.
                            Our AI crawls, analyzes, and lets you speak with any website's data.
                        </p>
                    </div>

                    {/* Input Section */}
                    <div className="space-y-6">
                        <div className="relative max-w-md mx-auto">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg blur opacity-25"></div>
                            <div className="relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg p-1">
                                <Input
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="https://example.com"
                                    className="bg-white border-0 text-black placeholder-slate-400 text-lg py-4 px-6 focus:ring-0 focus:outline-none"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <Button
                            onClick={startVoiceChat}
                            disabled={isLoading || !url.trim()}
                            className={cn(
                                "bg-gradient-to-r from-purple-600 via-blue-600 to-green-600 hover:from-purple-700 hover:via-blue-700 hover:to-green-700",
                                "text-white font-semibold py-4 px-8 rounded-lg text-lg",
                                "transition-all duration-200 transform hover:scale-105",
                                "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
                                "shadow-lg shadow-purple-500/25"
                            )}
                        >
                            <div className="flex items-center space-x-2">
                                <Mic className="w-5 h-5" />
                                <span>Start Voice Chat</span>
                                <ArrowRight className="w-5 h-5" />
                            </div>
                        </Button>
                    </div>

                    {/* Features */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 max-w-4xl mx-auto">
                        <div className="text-center space-y-3">
                            <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center mx-auto backdrop-blur-sm border border-purple-500/30">
                                <Globe className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-white font-semibold">Website Crawling</h3>
                            <p className="text-slate-400 text-sm">AI crawls and analyzes any website's content in real-time</p>
                        </div>

                        <div className="text-center space-y-3">
                            <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center mx-auto backdrop-blur-sm border border-blue-500/30">
                                <Mic className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-white font-semibold">Voice Conversations</h3>
                            <p className="text-slate-400 text-sm">Speak naturally and get voice responses about the content</p>
                        </div>

                        <div className="text-center space-y-3">
                            <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center mx-auto backdrop-blur-sm border border-green-500/30">
                                <Zap className="w-6 h-6 text-green-400" />
                            </div>
                            <h3 className="text-white font-semibold">Instant Intelligence</h3>
                            <p className="text-slate-400 text-sm">Get intelligent insights from any website's data instantly</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}