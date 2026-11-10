// Entry point. Screens are added ticket by ticket; for now the page only shows that it loaded.
const app = document.getElementById("app");
const note = document.createElement("p");
note.textContent = "Coming soon: load outputs, write pass/fail criteria, label a sample, and measure how well a judge agrees with you.";
app.append(note);
