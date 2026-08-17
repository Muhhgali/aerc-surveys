import { describe, expect, it } from "vitest";
import { assertSurveyTransition, createSurveySnapshot, escapeCsvCell, maskAccount, validateForPublish } from "@/src/domain/survey-management";

const survey = {
  id: "survey-1", version: 1, protocolNumber: "S-1", titleRu: "Опрос", titleKk: "Сауалнама", descriptionRu: "Описание", descriptionKk: "Сипаттама",
  startsAt: new Date("2026-08-17T08:00:00.000Z"), closesAt: new Date("2026-08-20T08:00:00.000Z"),
  questions: [{ id: "q1", position: 1, textRu: "Вопрос", textKk: "Сұрақ", required: true }], targets: [{ type: "building", city: "Astana", street: "Street", building: "1" }],
};

describe("Stage 4 survey domain", () => {
  it("creates a deterministic immutable publication digest", () => {
    expect(createSurveySnapshot(survey).sha256).toBe(createSurveySnapshot({ ...survey, questions: [...survey.questions] }).sha256);
    expect(createSurveySnapshot({ ...survey, questions: [{ ...survey.questions[0], textRu: "Changed" }] }).sha256).not.toBe(createSurveySnapshot(survey).sha256);
  });
  it("requires bilingual content, valid dates, questions and targeting", () => {
    expect(() => validateForPublish(survey)).not.toThrow();
    expect(() => validateForPublish({ ...survey, titleKk: "", targets: [] })).toThrow(/bilingual_title.*targeting/);
  });
  it("masks account values and neutralizes spreadsheet formulas", () => {
    expect(maskAccount("1234561911")).toBe("••••1911");
    expect(escapeCsvCell("=HYPERLINK(\"bad\")")).toBe("\"'=HYPERLINK(\"\"bad\"\")\"");
    expect(escapeCsvCell("normal")).toBe('"normal"');
  });
  it("permits only the managed close and archive lifecycle", () => {
    expect(() => assertSurveyTransition("active", "closed")).not.toThrow();
    expect(() => assertSurveyTransition("closed", "archived")).not.toThrow();
    expect(() => assertSurveyTransition("archived", "active")).toThrow(/transition/i);
  });
});
