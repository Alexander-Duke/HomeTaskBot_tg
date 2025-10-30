import { useQuery } from "@tanstack/react-query";
import { 
  CheckCircle2, 
  Server, 
  Code2, 
  Zap, 
  FileJson, 
  Shield,
  Globe,
  Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ServerInfo, ServerRoutes } from "@shared/schema";
import { useState, useEffect } from "react";

export default function Home() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: serverInfo, isLoading: serverInfoLoading, isError: serverInfoError } = useQuery<ServerInfo>({
    queryKey: ["/api/server/info"],
    refetchInterval: 5000,
  });

  const { data: routes, isLoading: routesLoading, isError: routesError } = useQuery<ServerRoutes>({
    queryKey: ["/api/server/routes"],
  });

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatMemory = (bytes: number) => {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      case "POST": return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "PUT": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
      case "DELETE": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
      case "PATCH": return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const features = [
    {
      icon: Server,
      title: "Express Server",
      description: "Fast, minimalist web framework for Node.js applications"
    },
    {
      icon: FileJson,
      title: "RESTful API",
      description: "JSON support and modern routing for building APIs"
    },
    {
      icon: Globe,
      title: "Static Files",
      description: "Middleware configured for serving static assets"
    },
    {
      icon: Zap,
      title: "Hot Reload",
      description: "Development server with automatic restart on changes"
    },
    {
      icon: Shield,
      title: "Error Handling",
      description: "Structured error responses and validation"
    },
    {
      icon: Activity,
      title: "CORS Enabled",
      description: "Cross-origin resource sharing ready"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Grid Background Pattern */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Server className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">Node.js Server</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center px-6 py-20">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="mb-8 inline-flex items-center justify-center">
            <CheckCircle2 className="h-20 w-20 text-green-500" data-testid="icon-server-status" />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-semibold mb-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Server Running Successfully
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-4" data-testid="text-timestamp">
            {currentTime.toLocaleString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </p>

          {serverInfoLoading ? (
            <div className="flex justify-center gap-4 mb-8">
              <Badge variant="secondary" className="text-sm" data-testid="badge-loading">
                Loading...
              </Badge>
            </div>
          ) : serverInfo ? (
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Badge variant="secondary" className="text-sm font-mono" data-testid="badge-node-version">
                Node.js {serverInfo.nodeVersion}
              </Badge>
              <Badge variant="secondary" className="text-sm font-mono" data-testid="badge-port">
                Port {serverInfo.port}
              </Badge>
              <Badge variant="secondary" className="text-sm uppercase" data-testid="badge-environment">
                {serverInfo.environment}
              </Badge>
              <Badge className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" data-testid="badge-status">
                {serverInfo.status.toUpperCase()}
              </Badge>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" data-testid="button-view-docs">
              View API Documentation
            </Button>
            <Button size="lg" variant="outline" data-testid="button-github">
              <Code2 className="mr-2 h-5 w-5" />
              View on GitHub
            </Button>
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section className="py-16 md:py-24 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Available Routes Card */}
            <Card data-testid="card-routes">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Code2 className="h-6 w-6" />
                  Available Routes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {routesLoading ? (
                  <div className="text-muted-foreground">Loading routes...</div>
                ) : routesError ? (
                  <div className="text-destructive text-center py-8" data-testid="error-routes">
                    Failed to load routes. Please check your connection.
                  </div>
                ) : routes && routes.routes.length > 0 ? (
                  <div className="space-y-3">
                    {routes.routes.map((route, index) => (
                      <div 
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/50 hover-elevate"
                        data-testid={`route-${index}`}
                      >
                        <Badge 
                          className={`${getMethodColor(route.method)} font-mono text-xs border min-w-[60px] justify-center`}
                          data-testid={`badge-method-${index}`}
                        >
                          {route.method}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <code className="text-sm font-mono block text-foreground" data-testid={`text-path-${index}`}>
                            {route.path}
                          </code>
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-description-${index}`}>
                            {route.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center py-8">
                    No routes configured yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Server Information Card */}
            <Card data-testid="card-server-info">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Server className="h-6 w-6" />
                  Server Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                {serverInfoLoading ? (
                  <div className="text-muted-foreground">Loading server info...</div>
                ) : serverInfoError ? (
                  <div className="text-destructive text-center py-8" data-testid="error-server-info">
                    Failed to load server info. Please check your connection.
                  </div>
                ) : serverInfo ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                      <span className="text-sm font-medium">Node Version</span>
                      <code className="text-sm font-mono text-muted-foreground" data-testid="text-node-version">
                        {serverInfo.nodeVersion}
                      </code>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                      <span className="text-sm font-medium">Express Version</span>
                      <code className="text-sm font-mono text-muted-foreground" data-testid="text-express-version">
                        {serverInfo.expressVersion}
                      </code>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                      <span className="text-sm font-medium">Uptime</span>
                      <code className="text-sm font-mono text-muted-foreground" data-testid="text-uptime">
                        {formatUptime(serverInfo.uptime)}
                      </code>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                      <span className="text-sm font-medium">Memory Usage</span>
                      <code className="text-sm font-mono text-muted-foreground" data-testid="text-memory">
                        {formatMemory(serverInfo.memoryUsage.used)} / {formatMemory(serverInfo.memoryUsage.total)}
                      </code>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center py-8">
                    Unable to load server info
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 md:py-24 px-6 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold mb-4">Features</h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to build modern web applications
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate" data-testid={`card-feature-${index}`}>
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-md bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="py-16 md:py-24 px-6">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold mb-4">Getting Started</h2>
            <p className="text-lg text-muted-foreground">
              Create your first route in just a few lines of code
            </p>
          </div>

          <Card data-testid="card-code-example">
            <CardContent className="p-0">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-3 right-3"
                  onClick={() => {
                    const code = `app.get('/api/hello', (req, res) => {\n  res.json({ message: 'Hello, World!' });\n});`;
                    navigator.clipboard.writeText(code);
                  }}
                  data-testid="button-copy-code"
                >
                  Copy
                </Button>
                <pre className="p-6 overflow-x-auto">
                  <code className="text-sm font-mono text-foreground">
{`app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});`}
                  </code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-documentation">
                Documentation
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-github">
                GitHub
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-license">
                License
              </a>
            </div>
            {serverInfo && (
              <p className="text-sm text-muted-foreground font-mono" data-testid="text-server-start-time">
                Server started: {new Date(serverInfo.startTime).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
