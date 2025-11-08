DROP TABLE IF EXISTS Choices;
CREATE TABLE IF NOT EXISTS Choices (
    GuildId TEXT NOT NULL CHECK (GuildId <> ''),
    GroupName TEXT NOT NULL CHECK (GroupName <> ''),
    Label TEXT NOT NULL CHECK (Label <> ''),
    PRIMARY KEY (GuildId, GroupName, Label)
);
