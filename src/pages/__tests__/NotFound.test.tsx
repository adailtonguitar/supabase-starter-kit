import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "../NotFound";

describe("NotFound", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeAll(() => {
    // NotFound logs a 404 to stderr; silence during tests to keep output clean
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy?.mockRestore();
  });

  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <NotFound />
      </MemoryRouter>
    );

  it("renders 404 heading", () => {
    const { getByText } = renderAt("/xyz");
    expect(getByText("404")).toBeInTheDocument();
  });

  it("shows 'Página não encontrada'", () => {
    const { getByText } = renderAt("/xyz");
    expect(getByText("Página não encontrada")).toBeInTheDocument();
  });

  it("displays the invalid path", () => {
    const { getByText } = renderAt("/rota-invalida");
    expect(getByText("/rota-invalida")).toBeInTheDocument();
  });

  it("has a link to home", () => {
    const { getByRole } = renderAt("/xyz");
    expect(getByRole("link", { name: /início/i })).toHaveAttribute("href", "/");
  });
});
