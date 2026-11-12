from torch import Tensor, cat, nn
from torch.nn.utils.rnn import pack_padded_sequence


class PhraseLSTM(nn.Module):
    def __init__(self, input_size: int, hidden_size: int, class_count: int) -> None:
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.dropout = nn.Dropout(0.3)
        self.classifier = nn.Linear(hidden_size * 2, class_count)

    def forward(self, sequences: Tensor, lengths: Tensor) -> Tensor:
        packed = pack_padded_sequence(
            sequences, lengths.detach().cpu(), batch_first=True, enforce_sorted=False
        )
        _, (hidden, _) = self.lstm(packed)
        representation = self.dropout(cat((hidden[-2], hidden[-1]), dim=1))
        return self.classifier(representation)
