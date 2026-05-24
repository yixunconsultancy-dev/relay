import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FileText,
  FileSliders,
  Loader2,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import {
  generateAppointmentSummary,
  generateProposal,
  generateSlides,
} from "@/lib/kit";

type Pending = "summary" | "proposal" | "slides" | null;

interface Props {
  contactName: string;
}

export function GenerateButtons({ contactName }: Props) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [purpose, setPurpose] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["documents", "generated"] });
  }

  const summary = useMutation({
    mutationFn: () => generateAppointmentSummary(contactName),
    onMutate: () => {
      setPending("summary");
      setError(null);
    },
    onSuccess: (r) => {
      setLastResult(`Appointment summary → ${r.pdf_path ?? r.md_path ?? "ok"}`);
      refresh();
    },
    onError: (e) => setError((e as Error).message),
    onSettled: () => setPending(null),
  });

  const proposal = useMutation({
    mutationFn: () => generateProposal(contactName, topic.trim()),
    onMutate: () => {
      setPending("proposal");
      setError(null);
    },
    onSuccess: (r) => {
      setLastResult(`Proposal → ${r.pdf_path ?? r.md_path ?? "ok"}`);
      setProposalOpen(false);
      setTopic("");
      refresh();
    },
    onError: (e) => setError((e as Error).message),
    onSettled: () => setPending(null),
  });

  const slides = useMutation({
    mutationFn: () => generateSlides(contactName, purpose.trim()),
    onMutate: () => {
      setPending("slides");
      setError(null);
    },
    onSuccess: (r) => {
      setLastResult(`Slides → ${r.pptx_path ?? "ok"}`);
      setSlidesOpen(false);
      setPurpose("");
      refresh();
    },
    onError: (e) => setError((e as Error).message),
    onSettled: () => setPending(null),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="gold"
          size="sm"
          disabled={pending !== null}
          onClick={() => summary.mutate()}
        >
          {pending === "summary" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          Appointment summary
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending !== null}
          onClick={() => setProposalOpen(true)}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Proposal
          <ChevronDown className="h-3 w-3" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending !== null}
          onClick={() => setSlidesOpen(true)}
        >
          <FileSliders className="h-3.5 w-3.5" />
          Slides
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
      {lastResult && !error && (
        <p className="text-xs text-status-success leading-snug">{lastResult}</p>
      )}
      {error && (
        <p className="text-xs text-status-error leading-snug">{error}</p>
      )}

      <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate proposal for {contactName}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label="Proposal topic" htmlFor="proposal-topic">
              <Input
                id="proposal-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. retirement planning, family protection"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setProposalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={!topic.trim() || pending !== null}
              onClick={() => proposal.mutate()}
            >
              {pending === "proposal" ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={slidesOpen} onOpenChange={setSlidesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate slides for {contactName}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label="Deck purpose" htmlFor="slides-purpose">
              <Input
                id="slides-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. annual review, kickoff, scenario presentation"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSlidesOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={!purpose.trim() || pending !== null}
              onClick={() => slides.mutate()}
            >
              {pending === "slides" ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
