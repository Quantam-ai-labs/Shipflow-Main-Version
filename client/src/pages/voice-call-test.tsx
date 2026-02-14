import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Phone, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CallResponse {
  success: boolean;
  status: number;
  data: any;
}

export default function VoiceCallTest() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<CallResponse | null>(null);
  const { toast } = useToast();

  const handleSendCall = async () => {
    if (!phoneNumber.trim()) {
      toast({ title: "Phone number is required", variant: "destructive" });
      return;
    }
    if (!messageText.trim()) {
      toast({ title: "Message text is required", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const res = await apiRequest("POST", "/api/voice-call/test", {
        phoneNumber: phoneNumber.trim(),
        messageText: messageText.trim(),
      });
      const data = await res.json();
      setResponse(data);

      if (data.success) {
        toast({ title: "Call initiated successfully" });
      } else {
        toast({ title: "Call may have failed", description: `Status: ${data.status}`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Failed to make call", description: err.message, variant: "destructive" });
      setResponse({ success: false, status: 0, data: { error: err.message } });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto" data-testid="voice-call-test-page">
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Voice Call Test</h1>
          <p className="text-sm text-muted-foreground">
            Test the Branded SMS Pakistan voice calling service. Enter a phone number and message to initiate a text-to-speech call.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Make a Test Call
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="phone-input">
                Contact Number
              </label>
              <Input
                id="phone-input"
                type="tel"
                placeholder="e.g. 923001234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                data-testid="input-phone-number"
              />
              <p className="text-xs text-muted-foreground">
                Use Pakistani format starting with 92 (e.g. 923001234567)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="message-input">
                Message Text
              </label>
              <Textarea
                id="message-input"
                placeholder="Enter the message that will be spoken to the recipient..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
                data-testid="input-message-text"
              />
              <p className="text-xs text-muted-foreground">
                This text will be converted to speech and played during the call
              </p>
            </div>

            <Button
              onClick={handleSendCall}
              disabled={isLoading || !phoneNumber.trim() || !messageText.trim()}
              data-testid="button-send-call"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Phone className="w-4 h-4 mr-2" />
              )}
              {isLoading ? "Calling..." : "Make Call"}
            </Button>
          </CardContent>
        </Card>

        {response && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5" />
                API Response
                {response.success ? (
                  <Badge variant="default" className="bg-green-600 text-white ml-auto">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Success
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ml-auto">
                    <XCircle className="w-3 h-3 mr-1" />
                    Failed
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">HTTP Status:</span>
                  <span className="font-mono font-medium" data-testid="text-response-status">{response.status}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Response Data:</span>
                  <pre
                    className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
                    data-testid="text-response-data"
                  >
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
